"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  colorSwatches,
  equipmentCategoryNames,
  getEquipmentCategory,
  publicDeviceCategories,
} from "@/lib/device-catalog";

const deviceCategoryImages: Record<string, string> = {
  "Fone de ouvido": "data:image/png;base64,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",
  "Celular": "data:image/png;base64,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...<truncated for brevity>"
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
