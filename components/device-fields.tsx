"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  colorSwatches,
  equipmentCategoryNames,
  getEquipmentCategory,
  publicDeviceCategories,
} from "@/lib/device-catalog";

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
          <DeviceGlyph type={category.icon} />
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
}: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  showCategory?: boolean;
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
            required
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
            required
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
            required
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
              required
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
                required
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
              required
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
                required
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
