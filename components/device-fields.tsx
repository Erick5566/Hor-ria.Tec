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
  "Notebook": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAMcElEQVR42u2bW2wc13nHf2dm9sKdnSW5Fy65tiSLN0eOKimS7SJ2a8RBiiBJGzeOAQNFkaRok4c+FEX7FKAXIH3IQ4Git5c+FG0fgqJ5C1CgdRo0hZHEFRIZDixLsKiLSUoUl7tLcndmdneupw8zs9ylSFp2RBmFOMBid4nZmfP/fZfzfecMhZSSR/lQeMSPIwBHAI4AHAE4AnAE4AjAEYAjAI/qoR3mxaWUih+EKiAACaAIpBBCAgghks8fWUMiPupmSEopwjBUQolQxNDAYkjDoKSUIATiAQI7LAACkDdu3vr4D374k68BG6efWtgE7OlqxSyVyreAYNzI1YWiOkDvg0IDCMNQ2Q1MCJGcM/w3+VABBEGgqqoa/MM/fuc7f/O91d96cmyJbq8vAS9+mbmxrARsPZdxxnL59YKhdxcX5lcAxyjXlk9M6b3pauU9oFcqldd1PWcrgi1FEAhFCUCEH9QgDysHiJi4+rM3f74AxeDd3kIQ30sD0oCe2Lx9pwEEH/e7y1R+/C6NdgBANXUHIHRdR6bTGVfX873CRGm9Uhp3x3L5uwVDtxYX5m8APaNcu31iSu9PVyu3ARfYKpXKLtAvGHpHURT7oSVBKaVQFCX0/GC617VKUEySYBLhw5aQ48UK7c0GWm5SbknQChHEelen5wSRi/cZwzLHqPeKXr8BcE7zmgDkyguDi03KmwCk05m2rucDPW80z545vfSn3/yjP5kYN96SUqpCiOBQAYRhqKiqGq6srDxmd53CkAuK4fPamw12/83vbg0+95yRcUo0A0Cm8gb4piQ/I53cGcL8DKHbE4DcdreVsN9AWua40t5C9ZrFjfp/Lf7+N77yWgxAOXwAEqEC6/XGE+/2Foy9Yi8Wz32KBxB9x0P1mlHym/osmekLaNYaoRvFUuhuD7xLpI1QYsgA0PXNLrC8h/cdbh2wvGHPAhkgTAquvYTfh3jwTVTPIkiVSR37dVL52k4llx7bgdBvCADpmgKQoeeJ6ZnHesePH19+6IWQ2Vw70d5sMF6shO3NhvJ+wvcSH1udIFVGffwLVOfORx601Saw1mLL9wjdbcIoNyBdc/D7NG30XMVOaeraftPhgwYgFBFZ/NrS9eP34+77Wd2z7pLN5nEmP0v11KfJlKo4rfpAvG/dTay+kyhi8UqwRahOSkBUq9Um0JJSCiHunTq1Bz0DqKoaeH5Q6Zh2bSgB3rdw2+qiZwOKx34JZfa3B8I3rl8jiGM+jvc9xQ9CI9iSAIsL87ej3Bxqqqr6hw5ACMHKysrMyuqdab+buSfTHxTnXt9iekg4wMb1a3ibN0bcfC/BQ8KjYszzeDyzzumnFm4+tGYoKVHX642pO1uyMpx19xQ9bPW8QerMHzA2v3iPcCU9gZKeQMvP7PCy7hL2G0jXRAm2CDwPNZUajn+RzmSYrlZuDJfIhwoglKBGH4832kEaDb/nBNpuS4/Eemz1sWf+GACnVWdz9Sqh2yNVnOM3XhwD4OLqsT3vmeQFZ/0SQecmqf7SwBkmJ0thqVReOagfeKAAFBFZ/PKVpdme40EQyL1E94MsqtfEZZzs7NcYO/epgdWT7P7yl08Pzt9PPECmVGUcYPLTtLcu4KxfIuw3ZNi5IfQ8fsHQ960BHiiAOP4loCUzwH4WV7HwC+epfeLVkVgPrDWKx07xwjn3fYU7rfpOYbXVjuLeWovCJD+D45oYRr+lKGL94XlA1AMUOqb9hNe3SGURXt8CwI3shMgukKk9z/SxUyMu7G3eoDx3nhfOuQcKHxafCE/EJ3UBIGV/Q8yePL0KYvNhJUEBSNvujt+6dWt2kJRTZUJ1EiVtoBUWSBXnANhcvYoaV3SBtXaPeKdVH3hHAmnP1ntUeDJFhno2UBYX5m9FzjnwzsOvBFutZvHt28qUl12QHggxZqBmKyjpCUJ3G2f9UnTjOKMPu/1u8U6rzsbV/x6Z/pT4Wkp6bC/hI4dRrt2MAdzTBT5wAGEYClVVWa83ZnuOlwICQJWuSeCaBFGTEt20sDCw/kycAC+u7rh2plTl7lv/Q3jzn/EZR2SniJscwn6DsN9AyVZG7z9aI4haepUTU/rNZHXoYYSAEjdBC17fQkltDe4aqpO7LBhZbyqe84fdfGp+kdUf/SvKxmu4jEdze1TaDoqfBMS++bi/QTqfYbpauXlQDfAgACR9fqiqqgdw6Y3X56W1QiYTLVj4cQ4QcQ4oz50fxPbupDY1v8jyD/4WrfPmIGkmBU5S4Q2D2A8AoOh63imVyq33WxP8MACElCggieNKAup22/zlVqv5FeCVJ2oG/a6t+b4PWNB/j2ZTQWvlcHvnMB5fZNncmSmL8Yyw8f1voll3B+IHic7zAAYghj1qdxkcqpMyTVuZm5vf0PVcLxnyLwxASqlIKVUgVKJFSTw/qNl299feuXL1dy5fWXoOSHVMm8nJEkyWojLXjqbBYhlc16Hf/l86rR8xLGH73Tye0x18z2Vy+Kny4Pt+3nDPjOB5qGyheU2q1edvpzTVD4JgTFXV3ocGIKVU4oXOIGknt9vmc61W8/Pr9carl68szV9buk69XgcIGq22Aoi7d1aIPCCuzTNZ0pkMhYkiup4fhQO4rorrOLhOP/IaLJpWtIyQVPipTA6f8gCKmkoNvGMIQtIFWkAtlKBK7iL2XnrXDhQebUgkPXTuxs1bX1qvN768vGG/aDbXJn725s9pNlu+nssIojZArZTGCXyXwkQRy+zsWNHpx+Kgs72J7/tomkY2p0cLmpOlCIhRGAAqxoBc16HftfH9HTCp4cw7DChVFrE3CWAaMCVsCz4ggCFrz7daza+u1xsvLW/YHxsyiPv0+bNqco3EC+yuM3KddCaD1WmTzmQJA59sTqffjVapFVXD6kQFTvKuaRqd7U2yOR3XcUhnMqTT0SsBcyz2HsvsEAb+kKdZNK2uKOdDTj+10PH8YMa2u53xgrGy3/6Atkc7K8IwTJlW9+lWq/n1i2+/95sQBaHZXJNGueYDilGupYd/e6Fcw2xGVdm1petcvpKms93Cti3SmexAsOs4+L4/AJKEh+v0R94ji/sjcDabG4NrpTMZqtO1kVACZLEMU9WZ1nS1YgFdXc+tCkHnfhdFFSFEYFrdU3/x7b/6TyC/uDDvA65RrmGUa1rs6mJo7Q9jSHwcf5GrmzbNZotur0/gu9iWOXBzAMvsjAwgCREA3/fJF8ZxHQdN00bySXJefX1tAGNysoSeNwJVS4uv/u7v5Y4fP/6WqojvKopi3vfeYJzwCMPQ+Ld/f/2ffvj9//hSrxvRHcvlKRh6IlAa5Vq4a8lLAGLYCxIAydHtRQMPfHfXgog5sKTrOrhOFEaj7h2Fx4i1VI28UWCqOiMBOV2tKL/6K8/z6itf/MuJceNbUkpbRFVQeN97g9GeIhKY3G6bH2u1mqfW640nlzfsxUtvvP6Jer3+2LDnJGBiqyd1gYgBiF7XEnbXEQmA3eJVLX0gkIHVXSe2fvSej5Olnjf86WpFq1arvPzS595+9pkLf5bS1O9FUlDEAeL33Rzdp3sSQN7zgznb7p5958rVZ5Y37JlLb7x+HJjqmHYRyO9xDw+Qva6lAMLuOkq31x+EUCJe1XZSym4ge8HR80Y4Xa0EY7l86unzZ81XX/niX0+MG98GevEO0H09d3DQ7rCQEiFlKKSUKIoS7lNSCqC23TbPvHPl6vnlDfuM2Vw7CUxdW7peBIyOaZOEUuyOEpCxZwhAdHt9cZDwkS7PKIR6LqPEVr/47DMX/jylqa8NzYz3vXP8QbfHxTAYQAoh9gJTDsNwqmPapVarObdeb5xd3rCfMptrT15bun5iF5DhqTOBk0Ah8F0xFC5hpTQeVqtVbXFhfvMzLz73d3OzJ/8eaErQxE4IclgADoAilfhJjzCl3bv+DhieH4zbdvdkq9WcBU5cfPu9czGUYx3T1gFlFxip5zIJFMZyea1g6Lz80ud+8twnn/1DAT+NQ1YTQvgfavCH8IBEAkQky+Rx/xDuc25KSlltd6y5Vqt5Zr3euHD5ytLZa0vXp4CJjmmP9boW1WqVC5984e7nP/X0tybGjX8BemEYavF1ww892If4jJAY3jtItqr2ySsaMLvdNk+3Ws3H1uuN4nS1IuZmT34XuBJP1WrUlP2Cg/roH5KK1ivibjOZffYDgwRV7OQK/t8DOMBblCSM4geeEIoSxonuwd3o6H+GHvHjCMARgCMARwCOABwBOAJwBOAIwKN6/B9Hgv8uXMbojgAAAABJRU5ErkJggg==",
  "Tablet": "data:image/png;base64,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",
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
