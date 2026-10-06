import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
const require = createRequire(import.meta.url);
export function savedPhotoHarness({
  confirm = true,
  initial = [],
  correct = async () => {},
  cleanup = true,
} = {}) {
  const state = [...initial],
    refs = [],
    calls = [],
    exports = {};
  let index = 0,
    refIndex = 0,
    tree,
    changed = 0,
    pending = 0;
  const mockReact = {
    ...React,
    useState: (defaultValue) => {
      const id = index++;
      if (!(id in state)) state[id] = defaultValue;
      return [
        state[id],
        (value) => {
          state[id] = value;
        },
      ];
    },
    useRef: (value) => {
      const id = refIndex++;
      refs[id] ||= { current: value };
      return refs[id];
    },
    useEffect: () => {},
  };
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync("components/saved-photo-actions.tsx", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      },
    ).outputText,
    {
      exports,
      require: (name) =>
        name === "react"
          ? mockReact
          : name === "@/lib/photo-corrections"
            ? {
                validateReplacementFile: () => {},
                correctSavedPhoto: async (...args) => {
                  calls.push(args);
                  await correct(...args);
                },
                cleanupSavedPhotos: async () => cleanup,
              }
            : name === "@/lib/photos"
              ? { preparePhoto: async (file) => file }
              : name === "@/lib/supabase"
                ? { message: (e) => e.message }
                : name === "./ui"
                  ? { ErrorBox: () => null }
                  : name === "./inline-camera"
                    ? { default: () => null }
                    : require(name),
      window: { confirm: () => confirm },
      URL: { createObjectURL: () => "blob:fixture", revokeObjectURL: () => {} },
      Promise,
    },
  );
  const render = () => {
    index = 0;
    refIndex = 0;
    tree = exports.default({
      orderId: "order",
      photoId: "photo",
      description: "Ângulo: Frente",
      onChanged: async () => {
        changed++;
      },
      onCleanupPending: () => {
        pending++;
      },
    });
    return tree;
  };
  const walk = (type, node) => {
    if (!node || typeof node !== "object") return [];
    const child = node.props?.children;
    return [
      ...(node.type === type ? [node] : []),
      ...(Array.isArray(child) ? child : [child]).flatMap((n) => walk(type, n)),
    ];
  };
  const nodes = (type) => walk(type, tree);
  render();
  return {
    render,
    nodes,
    calls,
    state,
    get changed() {
      return changed;
    },
    get pending() {
      return pending;
    },
    click: async (label) => {
      const button = nodes("button").find((n) => n.props.children === label);
      if (!button) throw Error("Missing " + label);
      button.props.onClick();
      await new Promise((r) => setImmediate(r));
      render();
    },
    choose: async (file) => {
      nodes("input")[0].props.onChange({
        target: { files: [file], value: "fixture" },
      });
      await new Promise((r) => setImmediate(r));
      render();
    },
  };
}
