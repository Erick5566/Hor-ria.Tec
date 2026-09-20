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
,
  "Notebook": "data:image/png;base64,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",
  "Tablet": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAOuElEQVR42u2bfXAc9XnHP7+929VJdzrJd/KLZFlYRrZlyzI2Ao+LAZMMhIaXMgkUOoQyaUpLC2mYdqbTTplOO50JTadpUhoIZJI0SSEkBUOnDbTF0KSug+Mwdm0s2XrFkiVZMkI6ne9Futu921//2NvV3oukkzlnJoVn5ub29vbtefs+b78VUko+zKTwIaePBPCRAD7k5P0A54pyD5RSCiGE/S2llCs5d8X3VBQlC5SF7qLMKCByDy2FEL8UYcMWdiUEIFzSVKSUCCEUpPRJUAGEEMKtsdxPj2maJqABQaDWPiSRnK8FqhbT0sTEZKnd1UAYCADK8Mg5P1CTu4YAzKRueHZsaRtq39p2AIgVPPvKBSCRikCYUkp/PDH32MTE5McAdXjkXBBoyDGR50pJ3eDCxBRH3joskom4BDyRSKQa8CxlyhPjo4s+x8yFpH2OCK/zL3pcMurBX5/lsw89cujP//QL9wDTUkpFCGFesgCkKasGBs8+Ozxy7sG8m+UYLaTZ2SgH//NVfn7kMDVag7N/Tp92tmu0BunzBRe9r78+C8BUNMCa+gQATc0t0iUsOTZ6zrm+69oSMDe0XKG99tqrv9u+te2bpml6FUXJrBgEbe3Hk3PXDo+cezCpG/orL72sjI2eE/v27RfNLRtKAlLvmW66j/WWYl4YRopAuAu550/EhuCGZf04BOz2ZYusZttGOPb2i5zo/QeEUJHScM6p8zcbgOwZGLqyfWsbgHlpYVA6N7wGkMeOHlcO/PB5b/exXs+zTz6rzM5GhW2W9md2NiqSibjzO5ZVRGzuPWEYKWEYKcSqT9B+81NsKYP55eiaPfdy/f5bkNJACLVI2OVGgXLyAB8gYvGEsyO8zk8yHi8y/SXBxtdC7d6HABiIjS163EBszPksR9s2/gVrw9sdIQihui2vrJBZVh6Q1A22d2zjk3fcRSQSoXNnF80tpbUYiUSY06etB0lbaC6EitJ4N7K22WHM/t4S3EDvWC+i/2mSZhilvgMAjz7IKWC+9Rqq19/qdoU8uu3GJ/nOv9yC1+shk8k6YFhRAdh0y623ldxva99tFVnfWsgqyNQogXAX4tpfR8TH872stpkTb7+IOfkyfv9qh3mArLYZgMHhY2i9P6Lzxi/hDVYXMxCsZm14O+/NnEEIlTl9mhzAikq5wKI0OxstMv1QKORsq+GdBMJdZJr3OwzL2mZn2+g/QHb4q1DdznzwxkXvk5g5zisHf4tMbL7k/w3b7gUgWLOWGq2BVCq2LPhdsgBsppfzeQBjTidphtGa9hZpHiA92oO2/o48zZe6hla7mdjce5zs+1HJY/as3kcg3MV8/S58viDhdX78mprNJWnyF1oMRSKRvN9qjeYw7CZzvA+lvsMx9bxzggI1KDCjpy0heFuh/mOcvNDHiZSnpBtsXrMPY07Pu0UuM1U+kADstLQcjRe6gNuXyyVfYyce/w7M6YFFjzmR8jgfm/RwqDBz9OYswPzAFmBnfEsJwQbAQgtYjFKT3SWZzyZ7mOv9YaE2HZo//3qRMNzW5opcqrswuhzlcBHzbtL1GHjDqMHFwdijD+ZZiOh/mnTklBXXfS1Q3Z7HFMCI2cK2EhbhPAvVeIhd/n5AKabdyZJMjeFlDNixqKlfef39hLraLMs5PsSqk7Mc+clpDMNApkZRs1OQ2YDhbc0TRL+UbBX5gn03HkNLTaLrMVZZYdDJj5cCQm8lGF8UwY0UVeOHYOs9eftbN6rsf/w38/Z10wZdX+WqVQ9z6t8fRI8PkslkkfFBYBCZ8FEV7ECpC0B8nN6LlrA9dQGLkfFDJGaOo6o+/GuucIPgkn0B5XIwnnde8v2iBGj/Z3ZZD33+It7zF+nuSzhWoF/hxXf9F1FVn5PiqqoPw0ih+xotYL2YwFMXQGludyJMpnk/vqv+iKpghw2CSsVdYCkhuM2/RmtwSlSZGkWfOIqas4Kuuxc8OLO+Du/5i3nXGR4xoLYZseZm1Kk3MYwUhmFQ529G7nyQjZ2teW4zPGIga5ud6xuAZ+hFJxNcLg/4wCDoZryw9rdLVa/LDTrbA3nHZtbXQV/CYca2lqy2mazxKnX+Znbd/KuI+/+25P1bN6qW0Gy3i0my1v2VclygLAGUCn+lGI9Gp13V3wZIjCCESjp2Gk//AUdLpWh4xMAc7yOb7MGISdSg4Pq7HuLqh7/kWMqJuGfZZ1WDgqzLve0m7GJC8K5E08HaQEnGCymTyVrNwqpGZGoUwzDI9B/IpcTXFh3f2R5g92e3cPh7AtjGbl+WwH3tdHbWWwDZbSlgd212WSEYMWk7v6w4BpQdW73WQ/r9q0lnpzCMFDI1Suqnj9Pdd0uRGwB0dtbT+eUF4ZyISE5EZBFG5GWdXW1Ejg8V7c/1BLIVD4NLad9t/lYITKNpliuIzIiVHMUHkS/8MfzVM0WMdZ8vwIWCbft4txVEjg8x0j2M6QqJHn3wFzYYWdoX1SqSZhi/BgQ2IlNjGIbBoX/9FrNbH2b/Z3Ytql3v+Ysys75OuH47gujuS/D+155kcPgYxpyOX5nB0K3Mb87bipoZrnxHaDkq1H4haVqQpLEGlSmuu+0Brr6plc6QgFB9XvXW3R2dz7XgPN7zFyUgMuvrHBA8+MRTaDMRBmNn6Qhu4jRnSc6FUYONdvih2pzPqwYvmwCWY7owGVLDO3n0m991gM2mq+pNG7CUq24IpoGzzx+ObQDqAek9f1Gk/uPLfOOVHgA6gpvoCG5ytgnCyQt9Tqo8p08Tsv6vXCKUjMeJRqepr29YkvFkIp434PArM+h6jO3XfI6PP/04mRy47Q4tWOc7UYWr6k3h6oT7HrghGHv+cGzm4BNPhQeHj0ktNSnwNTqMu8vfPav3AXA6dha/MkPaVWtd9pbYUiRTY+i+Rtp//wU+/vTj+dVbRC7ejLdGYOv+8nrfsfXq1ClAbF6zTxYyv2f1Pof5Xe13Wh2mmNVAybXEZMUFUI7ZNzW3YBgpPNsf4bqvPEeoq43uvoST7y9Ddj8/Ra2/8a//7e/PdAQ3Jdx9fpv5wo5QR3AThpFasaIqbgG2CxT2AW0Ez/vdHaX2xBt2zJauZ9KGEsbOtoB62+ce64rZJj4x9WZ5XSWrHK6cBZST/SUT5VeL3X0J/vGBT/LUXc3cf/eneOyO23n+cMyN2ikgNpQwuPmm66aB9KrUWfHezBm0mdIdJz0cypsQuROhyx4GV8L8oe+fpO+Z+9Hjg06x9NbP+z0/e/SL8pZnbp9fu+9GXw7AEkCsqakxes2ee2ePvc26pjU3y13tdwrb7IsARBoO9vk1VVa0H7AY427ml+sHHn+5l9MvvZArllry5geAeOkbUuTidxWwGmgdEtrVgFcPhxywK8W8NhNBVX3OXCCpG57LYgFLaTsUChXN+e0y1+g/gBGTTmIEMWTWg2EslLJvv/+WBvtNFyB6AP/OX3m36si7S2d3vZoX7dqvM3/uFaqjJytfDCUTcfyB2rJmAqrqw3z7bzg6cdRh2u4Dpia7rcRIrSLjWQPGKMacjqI5DBZapb6uaU16z+omtZTm7aaox78DT13AaQT6NdWseENkJb6emDmOMMPUbPuNomaoMf0qhpFGVauQWR8iM0yWDj7xZ58X70QV4coQAYwLE1NpaLK1KgqZ7x3rvWT3LuugcuJ/of8XIPJCelYXQNl0J6pahWGkLSsAdu+5N68KfCfqPFr1qZ9dGSpV4Pzz1AQ9fS+VVpZuiOVmAhWLAqXAz+v1kJnvy+vcOqC39R5E0142x89Y/193Ozfc1EqpdSxnf/JfnhcP/A6bWj6NHg5Rvf5W5s+/zrvxhd5/NtmT29pRpNzL3hNcCvllapTUZDc1zaVH457OVqexAVmr7UVdXq3w4zcO5Qajz6Bs/Dxq/KVF75dN9qClJvOqwYr0BFfCtLsnGAgGIfY/mOOdKM3tef9vFQLdFSlOdLWxuzZfCM8fjvFPx7dQtfMPMKcHUJaYMpnTAxgzp8hmp/LWJ1VsOlzuzM8eiGhakPngjei+xqI5YOFUxwE0V7+vuzvKwSeeslzEvwP1ik9jxGTex+4BmtMDlubTkyWSowpjwEoE4QCfPkj6rSfw7XwQWduMfoUX7VzplWuZ9XUc+v5JBl7/QY75BfD0YYVRu+1lToM5p1OtzFx6//JyMu/uzxlzOsbRb1HVsoOR+N6SK8Uix4f48ddecwDO418ANXsa5KOTbNJSanq0BzUzjJ5LrvyhnfiZt8vhDzYYcS15XVH8txOhpBlG0TY7QrA7NunRHtKjPZyq0eCnoDRssUz425Mkc5NhT+sf4mvsLAa5nBA8dXudinNDLpLY0WTg9R9QZU2GKtYSK3vNnZusblB+h9Y987cnuWasH8NIY6QnkdJAVX0w/gzZ4CNoTXvJXkwUCcEdWsdqtzvWpOfAMDeZqlgqnGYFgwbnpNhpMpFTCzmBZw2qWmU1SM0wSTMM3rDzFH7/apKRUwtNjTNfRy9wg8J8YqmGFAvrmLmkyZDrhKOuDCzDwspQt1CcfU3NLYyNnssbkAB4s1PILHjMBuH3uTI2M4zfBrGqRmtNgC3E/gOo4QGUhi0AbFRKry+ej59hrHY7G46cYVXqLCmtQfg1NV5OHrDkYmnTND2A9sprB7/y3He++3vlgODE+CgzF5JcTI4XpcXuNb2lrEoI9ZLfRcgJO2sYKfXXPnXfhee+9+3bg7X+/zVN05N7gWLlAnAtNQ/19Q/93Zv/faR9djaawVr/n8m5HUBVMh5vAMKxeKIKENHotJFMxA1/oNYERDIRV7HeHRAF+JKPHYHaFYFugVLMzp1dyhce/e032re23QfM5nKdS1suX8KEbJvWchfNuBgJAWtzvufJ/RfHGtmruYFHHdZLDkJKVCnNmtyxtgtpud+mO1FLJOdtazED/mqZu3Y2kZyXrmTOE/BXexRFiQJvSSnfz0WxS39hojCb+mV5XWYlJC7xzdFSIFhk0rlcwp7PFwpzRSlr2Q9mKcmkwi9N/b+lj16c/EgAHwngw03/B0TpCgZwjc0fAAAAAElFTkSuQmCC",
  "Outro": "data:image/png;base64,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"
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
