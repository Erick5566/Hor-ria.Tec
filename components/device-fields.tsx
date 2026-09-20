"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  colorSwatches,
  equipmentCategoryNames,
  getEquipmentCategory,
  publicDeviceCategories,
} from "@/lib/device-catalog";

const deviceCategoryImages: Record<string, string> = {
  "Fone de ouvido": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAADjklEQVR42u3d0VHzOhSF0UjjBiiBAmiAHlIDtVEDPdAABVACJcBrhgcIdmyks9cq4J+JfPRJmZuLTycAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADI0SxBbY/n58+t/8bry5M5EQCqb3RhEABseEEQAGx4QRAAbHoxEABsfCEQAGx8IRAAbHwhEABsfCEQAGx8IRAAbHwhEABsfCGYSbcENr/1EwAMr3X0FYCKA7vlGl3psyAApTf/kZsj5XMKAENvihE2g/8VWQBsfINvPQTA5jfo1kYAbH7DbZ0EwOY30NZMAGx+Q2z9BMDwGlxrKQAG1rBa12H4KbAh/Xd7rIOfDwuAzS8CIvCLxRLMP+jV1sbGdQMoefrb/Mevk5gIgM0vAiIgADa/CCAAvvNbPwTgiNPC8I4VAbcAAbD5RUAEBMDmFwEEwHdW6ysA3OpUMJzzRMAtQACcTNZbACyB08BzFwCcRtZdAJwChjArAum3ADcAm99zEACnP+ZAAHDqeB4CoPqYBwHAaeO5CIDaYy4EAKeM5yMAKo/5qKN50E4Xzzf3+cb+WfDLh+1W4CtDKifalaeG07/O8/Qs3QDcCpz0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK8S8Mvnu/mHV674/3t+8VtrzL6sbDcglACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAwC0tlT7M2ve/wV9nqso7A5uN/zMvBzUfleejebBCYOPnzkf3cH29sPlz56N7uCJg8+fOR/dwRcDmz50P/xkQgk0VgFHq6hZgPqrMhxsAuAGou1uA0z9xPtwAwA0ASLRU/WDff5nlys7WOao4Q24A4CsAIACAAAACAAgAIACAAAB1LCkf9Jo/2eTHQjn8iTc3ABAASwACAAgAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIADAbsq+GchbfjAfbgCAAABTB2C0lzl6uaT5qDAfbgDgBqDyTn+3gMT5cAMANwCVd/q7BSTOR/eQbX4RyJ2P7iHb/CKQOx8lhnrPX3XZ+Oaj8nw0D9rGFwLzAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAT+gLgXL0Q3+o7JAAAAABJRU5ErkJggg==",
  "Celular": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAADtUlEQVR42u3bsW0yMRiAYS5iAUpKGqRIgQHYgRlYImNkCWZgBwYIkSKloUzJCKQPESh357PP3/OUf4P4Yr/2Af9kAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHTRGEFem+3+Gn0Gx8POOhQAGx5BEAAbHyEQABsfIUjvyQhsfnN0A8CCdRtwA8DmN18BwOI0ZwHAojRvAcBiNPdKTY2gDp8fb4O/5vPLq8G7ATiFIm7+nK/rFtAfX6kUsPi6fLU1W6yyb4DL+dSMeYYeARicBXs7B6e5R4AQp7/N3/9cxEMAQp78Xa7fJb6+OApAtad/qsWdKwKpXrftnNwCfAYQ9pk/900gxbxsaDcAm9/cEABAAEb8/I+/jwC4xmJ+AgCUwbcAhSjhJ71Dq+2bCwHAxm/x3oXAI4DNbw4IgEVvHgiAxW4uCIBFbj6k5UPAgnx/vYd5r/Pl2h/cDcDpFnHzP3q/bgECYDN43wgAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIACAAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAIABGAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAgAAAAkA+8+Xa+0YAanc5nxqb4fH7vTcn+jU1AicibgAUcAvAfATAIjcXBMBiNw8EwKI3BxLyIWAhi3+2WF1tfATAKQgeAQABAAQAEABAAAABAAQAaMvvAIL664dHfovgBkDQzX/v3xEAKt/8IiAABN/8IiAABN/8IiAAgADQh8127yQ1PwGoxfGw81WZv48AAALASK6x//2RTwk/CnL9FwARyBABm18ASPCcOYYIjHnze/4XADeBDhFw8sejmJkWq9PKPEvgfwMWsNgjL14nvhuABUwnTn+fAVh85o8AAALgFDJ3BMBiNG8EwKI0ZwTA4jRffjPMhHxFaOO7AVi0mKMbgNuA24CNLwBCIAQ2vgAgCDY8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQjR+0Uj56vfx+pQAAAABJRU5ErkJggg=="
,
  "Notebook": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAD10lEQVR42u3dMVITURzA4d0MzNBKayW9HAB7rfAIcgWP4hXwCFJpLweAXipbaJmxiCfIqHGLzft93w14+/6/fZuEZJoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGBkc/mPv7i83toCTNM03d5czQJg6CEVg43hh+4+mV1Q6J4GNoYfuvtn4+JBdx9tXF7oGjYA7v7YT9EAGH7sK48AgAAAmQA4/mN//b0jl7T7OXDcMDaG3/C7/gIACAAgAIAAAAIACAAwGp8D2OH519YHigZzcjx7y9cJABAAQABAAAABAAQAEABAAAABAAQAEABAAAABAAQAEABAAAABAASAlfn47ec7q4AAhIdfBBCA+J1fBASA+LFfBASA+DO/CAgA0eEXAQEgPvwiIADEh18EBID48IuAABAffhEQAOLDLwICQHz4RUAAiA8/AoDhFxgBoH7nFwEBIH7sFwEBIP7MLwICQHT4RUAAMHgiIAAYOBEQAPKDJgICQHzAREAAiA+WCAgA8YESAQEgPkgiIADEB0gEBID44IiAABAfGBEQAOKDIgICQHxAREAAiA+GCAgA8YEQAQEgPggiIACG3xqIgADY+NYCAbDhrQkCYKODABh+64MA2NzWCQGwqa0XAmAzWzcEwCa2fgiAzWsdWcKRJVjWp7cvv9r0y0Xgf9YTAUjEY/TvEhABASB86hABASAeDxEQAOKPLCIgADh1iMCCvA1IJh4IACAAgACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIACAAAACAKyarwTb4eR4nq0CTgCAAAACAAgAIAADuLi83toGrn+VdwFsApwAxnF7c+XtO+wvjwCAAACtAHgMwL6KnwBEAPvJIwBQDYBTAPZR/AQgAtg/u6WGwwd+MPjh1wCcBrBPwicAJwIMPQAAAAAAAAAAAAAAAAAAcCBW9z/QL1699j/6DO3p4X4WgD9E4PHHnZ3CUE7Pzlc1/NO00q8Ee3q4n0/Pzu0YDH8xAEA8AE4BuPvHTwAigOGPPwKIAIY//hqACGD4wwEQAQx/PABAPABOAbj7L+sgfw5pn08Kvnn/2e7kn3z/8mHo4T/YRwAnAdz5468BiACGPxwAIB4ApwDc/eMnABHA8McfAUQAw7+feaSL4otEMPzBEwAgAB4FcPevnwBEAMMffwQQAQx//DUAEcDwhwMgAhj+eACAeACcAnD3322uXEw/OcY+Nw+rAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA6/Mbmv/VRIQkE5wAAAAASUVORK5CYII=",
  "Tablet": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAADeUlEQVR42u3cwW3yMBiAYVKxACNwrFQWyA6ZgSU6RpfIDOzAAlTqkREYIT1XaouS2NFn+3mOv/6T/fmNQxG7HQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALBGZwnyOBxPk1VI63G/mVcBcOgRAwFw6BGD1V4sgcNvH9wAMHBuA24AOPz2RwAwXPZJADBU9ksADJNhsm8CYIiwfwIACICnB/axfP5mmnFo/E3afkS3twTpGbR8a+pp7hXA4be+CEC866bhjB0BtwcB8GSy3giAYbTuCIBrov0VADyFrL8AAAIAtMMXgTbQD6P3zoWul7MrvgA4+K2voRB4BXD4rScCYFitKwJgSK0vAgAs50PAjZ5OPsRKt579ME7W0w2gGIbVugkAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgAIAAAAIACAAgACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIACAAAACAAgAIAAgAIAAkEk/jJNVsG4RdZbgp8PxNGvoHvdbZ2i3db2cu5R75gYACADpn05YXwEwpFhXATCsWM9Y9pYg/9D6YNDBFwBDDF4BAAEABAAQAEAAAAEABADIzfcAGvXbl5N8X8ENgEYP/3//jgBQ+eEXAQFggbk/RhH58JcYgZLWXwAKUOuvxcw91LXeBPwakAB4Cll3BMAwWm8EIOE10VDGPvyu/wLgyWR9EYD8QxptUOd+ySfal4IirmkNXIkae9q8vr0//T9fnx9e69wAqHFonh1uh18AqNxfh7zGw49XAK8CbnG4ARgi+4YAGCb7hQAYKvuEABgu+9M0i7WCDwcdfDcAQ4d9cAPAjcChFwDEwKEHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABa8w3wMRFB7xTHogAAAABJRU5ErkJggg==",
  "Outro": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAADiklEQVR42u3dvVEqURiAYXBswJAxMiGTIggsgAKowVKsgQIowIAiMCMxcggtQTNHd0aYA/vtnp/nie7o3L2zhz3vHna57GQCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeZoagnh3D49fp37/+f42tf247fO/G0MAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIACAAgAAAAgAIABDN960P4Nz33nOa5wIIgEmPEAiAiY8QuAZg8htnrAAckFgNWAGY/MYfAQAEwNnH64AAOOi8HggAcIIrqAOdbY6HvYFLNJsvkv+OuwJpbg1BLBP/+rG7JAR4C2DyG0daWwG4GOTtWfS/UdPbDCsAZy3j6S0AIACAAAACAAgAIABAdar7HED0PVqfM3AMCACDWa42xe/Dbrv2QgoArU387r4IgWsANDb5W9gvAcAksX8CgMlhPwUAEACcFe2vAADZchuwECXeQnOWtwIABAAQAEAAAAEARuYuQEWeXz9+/vzydF/c9hGAq7X4//V/T8zuz/qYqNHbL+0Y8FwAQADI8+yf8vuxt48AAAIACABJzl2Eu/YiXfT2EQBgJD4HUNEqIOo+ffT2EYDetPxcgOhJWcqk91wAbwEAAQAEABAAQAAAAQAEAAQAEABAAAABAAQAEABAAIB6+D6AinguAM0HwHMB/v7McwH657kAgACQ59k/5fdjbx8BAAQAEACSeC4AAgBcxOcAKloFeC4AzQfAcwHK3X4px4C3AIAAAAIACAAgAEAx3AYsxHK1MQhYAQACUJ3ddm1/EQBAAKwC7CcCIAL2DwEQAftFCLcBM58sNdz+M/EFAJMHbwEAK4BALT4XgGGPAc8FAAQAEABAAAABAASgdbP5wiAYTwEA8uX70y+Qcp/5eNgbsAHP/p4JkMZHgQc6eIXAst8KoNFVAMNw9ncNABAAZxuvBwLgoPM6IACAADj7GH86DF6P3Bkw8a0AHJQYZysAqwGrARNfABADEz9jPgpcwQF+LjClbx/XAAABAAQAEABAAAABAAQAEABAAAABAAQAEABAAEAADAEIACAAgAAAAgAIACAAgAAAAgAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAET5BtkjHqdr9jYFAAAAAElFTkSuQmCC"
};

export function DeviceGlyph({ type = "phone" }: { type?: string }) {
  return (
    <span className={`device-glyph ${type}`} aria-hidden="true">
      <span />
    </span>
  );
}

export function DeviceCategoryCards({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="category-cards"
      role="radiogroup"
      aria-label="Tipo de equipamento"
    >
      {publicDeviceCategories.map((category) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === category.name}
          className={value === category.name ? "selected" : ""}
          key={category.name}
          onClick={() => onChange(category.name)}
        >
          <img
            className="device-card-image"
            src={deviceCategoryImages[category.name]}
            alt=""
            aria-hidden="true"
          />
          <strong>
            {category.name === "Outro" ? "Outros" : category.name}
          </strong>
        </button>
      ))}
    </div>
  );
}

export default function DeviceFields({
  value,
  onChange,
  showCategory = true,
  required = true,
}: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  showCategory?: boolean;
  required?: boolean;
}) {
  const categoryName = value.categoria || "Celular",
    catalog = getEquipmentCategory(categoryName);
  const selectedBrand = catalog.brands.find(
      (item) => item.name === value.marca,
    ),
    models = selectedBrand?.models || [];
  const [brandOpen, setBrandOpen] = useState(false),
    [modelOpen, setModelOpen] = useState(false),
    [manualBrand, setManualBrand] = useState(
      () => Boolean(value.marca) && !selectedBrand,
    ),
    [manualModel, setManualModel] = useState(
      () =>
        Boolean(value.modelo) &&
        (!selectedBrand || !selectedBrand.models.includes(value.modelo)),
    ),
    [manualColor, setManualColor] = useState(false);
  const previousCategory = useRef(categoryName);
  useEffect(() => {
    if (previousCategory.current === categoryName) return;
    previousCategory.current = categoryName;
    setBrandOpen(false);
    setModelOpen(false);
    setManualBrand(false);
    setManualModel(false);
    setManualColor(false);
  }, [categoryName]);
  const normalize = (text: string) => text.toLocaleLowerCase("pt-BR");
  const brandMatches = useMemo(
    () =>
      catalog.brands.filter((item) =>
        normalize(item.name).includes(normalize(value.marca || "")),
      ),
    [catalog.brands, value.marca],
  );
  const modelMatches = useMemo(
    () =>
      models
        .filter((model) =>
          normalize(model).includes(normalize(value.modelo || "")),
        )
        .slice(0, 16),
    [models, value.modelo],
  );
  const glyph = catalog.icon;
  const chooseManualBrand = () => {
    setManualBrand(true);
    setManualModel(true);
    setBrandOpen(false);
    setModelOpen(false);
    onChange({ ...value, marca: "", modelo: "" });
  };
  const chooseManualModel = () => {
    setManualModel(true);
    setModelOpen(false);
    onChange({ ...value, modelo: "" });
  };

  if (catalog.open)
    return (
      <div className="device-fields open-device-fields">
        {showCategory && <CategorySelect value={value} onChange={onChange} />}
        <label>
          Tipo do equipamento
          <input
            required={required}
            minLength={2}
            maxLength={120}
            value={value.tipo_personalizado || ""}
            onChange={(event) =>
              onChange({ ...value, tipo_personalizado: event.target.value })
            }
            placeholder="Ex.: Caixa de som"
          />
        </label>
        <label>
          Marca
          <input
            required={required}
            maxLength={100}
            value={value.marca || ""}
            onChange={(event) =>
              onChange({ ...value, marca: event.target.value })
            }
            placeholder="Ex.: JBL"
          />
        </label>
        <label>
          Modelo
          <input
            required={required}
            maxLength={120}
            value={value.modelo || ""}
            onChange={(event) =>
              onChange({ ...value, modelo: event.target.value })
            }
            placeholder="Ex.: Flip 6"
          />
        </label>
        <label>
          Cor
          <input
            maxLength={100}
            value={value.cor || ""}
            onChange={(event) =>
              onChange({ ...value, cor: event.target.value })
            }
            placeholder="Ex.: Preto"
          />
        </label>
      </div>
    );

  return (
    <div className="device-fields">
      {showCategory && <CategorySelect value={value} onChange={onChange} />}
      <div className="search-select">
        {manualBrand ? (
          <label>
            Digite a marca
            <input
              required={required}
              autoComplete="off"
              maxLength={100}
              value={value.marca || ""}
              onChange={(event) =>
                onChange({ ...value, marca: event.target.value, modelo: "" })
              }
              placeholder="Marca do equipamento"
            />
            <button
              type="button"
              className="field-link"
              onClick={() => {
                setManualBrand(false);
                setManualModel(false);
                onChange({ ...value, marca: "", modelo: "" });
              }}
            >
              Escolher uma marca da lista
            </button>
          </label>
        ) : (
          <>
            <label>
              Marca
              <input
                required={required}
                autoComplete="off"
                placeholder={`Pesquisar marca de ${categoryName.toLowerCase()}`}
                value={value.marca || ""}
                onFocus={() => setBrandOpen(true)}
                onChange={(event) => {
                  onChange({ ...value, marca: event.target.value, modelo: "" });
                  setBrandOpen(true);
                  setModelOpen(false);
                  setManualModel(false);
                }}
              />
            </label>
            {brandOpen && (
              <div className="option-popover" role="listbox">
                {brandMatches.map((item) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={value.marca === item.name}
                    key={item.name}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange({ ...value, marca: item.name, modelo: "" });
                      setBrandOpen(false);
                      setModelOpen(false);
                      setManualModel(false);
                    }}
                  >
                    <DeviceGlyph type={glyph} />
                    <span>{item.name}</span>
                  </button>
                ))}
                {!brandMatches.length && (
                  <p>Nenhuma marca encontrada nesta categoria.</p>
                )}
                <button
                  type="button"
                  className="manual-option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={chooseManualBrand}
                >
                  + Adicionar outra marca
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <div className="search-select">
        {manualModel ? (
          <label>
            Digite o modelo
            <input
              required={required}
              autoComplete="off"
              maxLength={120}
              value={value.modelo || ""}
              onChange={(event) =>
                onChange({ ...value, modelo: event.target.value })
              }
              placeholder="Modelo informado pelo cliente"
            />
            {!manualBrand && (
              <button
                type="button"
                className="field-link"
                onClick={() => {
                  setManualModel(false);
                  onChange({ ...value, modelo: "" });
                }}
              >
                Escolher um modelo da lista
              </button>
            )}
          </label>
        ) : (
          <>
            <label>
              Modelo
              <input
                required={required}
                autoComplete="off"
                disabled={!selectedBrand}
                placeholder={
                  selectedBrand
                    ? `Pesquisar modelo ${selectedBrand.name}`
                    : "Selecione uma marca da lista"
                }
                value={value.modelo || ""}
                onFocus={() => setModelOpen(true)}
                onChange={(event) => {
                  onChange({ ...value, modelo: event.target.value });
                  setModelOpen(true);
                }}
              />
            </label>
            {modelOpen && selectedBrand && (
              <div className="option-popover model-options" role="listbox">
                {modelMatches.map((model) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={value.modelo === model}
                    key={model}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange({ ...value, modelo: model });
                      setModelOpen(false);
                    }}
                  >
                    <DeviceGlyph type={glyph} />
                    <span>
                      <strong>{model}</strong>
                      <small>
                        {selectedBrand.name} · {categoryName}
                      </small>
                    </span>
                  </button>
                ))}
                {!modelMatches.length && (
                  <p>Modelo não encontrado nesta marca.</p>
                )}
                <button
                  type="button"
                  className="manual-option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={chooseManualModel}
                >
                  + Adicionar modelo manualmente
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <fieldset className="color-picker">
        <legend>Cor</legend>
        {catalog.colors.map((name) => (
          <label
            key={name}
            className={
              (name === "Outra" ? manualColor : value.cor === name)
                ? "selected"
                : ""
            }
          >
            <input
              type="radio"
              name="device_color"
              value={name}
              checked={
                name === "Outra"
                  ? manualColor
                  : value.cor === name && !manualColor
              }
              onChange={() => {
                if (name === "Outra") {
                  setManualColor(true);
                  onChange({ ...value, cor: "" });
                } else {
                  setManualColor(false);
                  onChange({ ...value, cor: name });
                }
              }}
            />
            <span style={{ background: colorSwatches[name] }} />
            <small>{name}</small>
          </label>
        ))}
      </fieldset>
      {manualColor && (
        <label className="manual-color">
          Digite a cor
          <input
            maxLength={100}
            value={value.cor || ""}
            onChange={(event) =>
              onChange({ ...value, cor: event.target.value })
            }
            placeholder="Cor do equipamento"
          />
        </label>
      )}
    </div>
  );
}

function CategorySelect({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}) {
  return (
    <label>
      Categoria
      <select
        value={value.categoria || "Celular"}
        onChange={(event) =>
          onChange({
            ...value,
            categoria: event.target.value,
            tipo_personalizado: "",
            marca: "",
            modelo: "",
            cor: "",
          })
        }
      >
        {equipmentCategoryNames.map((category) => (
          <option key={category}>{category}</option>
        ))}
      </select>
    </label>
  );
}
