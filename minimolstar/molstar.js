import { PluginContext } from "molstar/lib/mol-plugin/context";
import { Asset } from "molstar/lib/mol-util/assets";
import { ColorThemeCategory } from "molstar/lib/mol-theme/color/categories";
import { Color } from "molstar/lib/mol-util/color";
import { Bond, StructureElement, Unit } from "molstar/lib/mol-model/structure";

function onReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
}

function setStatus(root, message) {
  const status = root.querySelector(".structure-viewer__status");
  if (!status) return;
  status.textContent = message;
}

function suppressWheelListeners(element) {
  if (!element || typeof element.addEventListener !== "function") return () => {};
  const originalAdd = element.addEventListener.bind(element);
  element.addEventListener = function (type, listener, options) {
    if (type === "wheel") return;
    return originalAdd(type, listener, options);
  };
  return () => {
    element.addEventListener = originalAdd;
  };
}

async function initHeroStructure(root) {
  if (!root || root.dataset.viewerInit === "true") return;
  const src = root.dataset.structureSrc;
  if (!src) return;

  const target = root.querySelector("[data-structure-target]") || root;
  suppressWheelListeners(target);
  root.dataset.viewerInit = "true";
  setStatus(root, root.dataset.structureStatus || "");

  try {
    const plugin = new PluginContext({ actions: [], behaviors: [], animations: [], config: [] });
    await plugin.init();

    plugin.representation.structure.themes.colorThemeRegistry.add(
      createBfactorTheme(ColorThemeCategory, Bond, StructureElement, Unit, Color)
    );

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    suppressWheelListeners(canvas);
    target.appendChild(canvas);

    const ok = await plugin.initViewerAsync(canvas, target);
    if (ok === false) throw new Error("Mol* viewer initialization failed");

    const trackball = plugin.canvas3d?.props?.trackball;
    plugin.canvas3d?.setProps({
      transparentBackground: true,
      camera: { helper: { axes: { name: "off", params: {} } } },
      trackball: {
        ...trackball,
        animate: { name: "spin", params: { speed: 0.05 } },
        zoomSpeed: 0,
      },
    });

    plugin.canvas3d.input.noContext = true;
    plugin.canvas3d.input.noScroll = true;

    const data = await plugin.builders.data.download(
      { url: Asset.Url(src), isBinary: false },
      { state: { isGhost: true } }
    );
    const trajectory = await plugin.builders.structure.parseTrajectory(data, "pdb");
    const model = await plugin.builders.structure.createModel(trajectory);
    const structure = await plugin.builders.structure.createStructure(model);
    const component = await plugin.builders.structure.tryCreateComponentStatic(structure, "all");

    if (component) {
      await plugin.builders.structure.representation.addRepresentation(component, {
        type: "cartoon",
        color: "bfactor-plddt",
      });
    }

    window.addEventListener(
      "beforeunload",
      () => {
        plugin.dispose();
      },
      { once: true }
    );

    root.dataset.viewerReady = "true";
    delete root.dataset.viewerError;
    setStatus(root, "");
  } catch (error) {
    console.error("Failed to initialize Mol* viewer", error);
    root.dataset.viewerError = "true";
    setStatus(root, "Unable to load structure");
  }
}

function createBfactorTheme(ColorThemeCategory, Bond, StructureElement, Unit, Color) {
  const DefaultColor = Color(0xaaaaaa);

  function bfactorToPlddtBinColor(score) {
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0) return DefaultColor;
    if (score <= 50) return Color(0xff7d45);
    if (score <= 70) return Color(0xffdb13);
    if (score <= 90) return Color(0x65cbf3);
    return Color(0x0053d6);
  }

  function themeFactory(ctx, props) {
    let color = () => DefaultColor;

    if (ctx.structure) {
      const location = StructureElement.Location.create(ctx.structure.root);

      const getColor = (loc) => {
        const { unit, element } = loc;
        if (!Unit.isAtomic(unit)) return DefaultColor;
        const bFactor = unit.model.atomicConformation.B_iso_or_equiv.value(element);
        return bfactorToPlddtBinColor(bFactor);
      };

      color = (loc) => {
        if (StructureElement.Location.is(loc)) return getColor(loc);
        if (Bond.isLocation(loc)) {
          location.unit = loc.aUnit;
          location.element = loc.aUnit.elements[loc.aIndex];
          return getColor(location);
        }
        return DefaultColor;
      };
    }

    return {
      factory: themeFactory,
      granularity: "group",
      preferSmoothing: true,
      color,
      props,
      description: "pLDDT-style coloring using atomic B-factors.",
    };
  }

  return {
    name: "bfactor-plddt",
    label: "B-factor as pLDDT (bins)",
    category: ColorThemeCategory.Validation,
    factory: themeFactory,
    getParams: () => ({}),
    defaultValues: {},
    isApplicable: (ctx) =>
      !!ctx.structure?.models.some((model) => model.atomicConformation.B_iso_or_equiv.isDefined),
  };
}

onReady(() => {
  const target = document.querySelector("[data-structure-viewer]");
  if (target) initHeroStructure(target);
});
