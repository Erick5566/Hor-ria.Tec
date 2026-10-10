import { featureEnabled, platformFeatures } from "@/lib/platform-features";

export default function PlatformFeatureControls({
  flags,
  disabled,
}: {
  flags: Record<string, boolean>;
  disabled: boolean;
}) {
  const groups = [...new Set(platformFeatures.map((feature) => feature.group))];
  return (
    <div className="platform-feature-groups">
      {groups.map((group) => (
        <fieldset
          className="platform-feature-group"
          key={group}
          disabled={disabled}
        >
          <legend>{group}</legend>
          <div className="platform-feature-grid">
            {platformFeatures
              .filter((feature) => feature.group === group)
              .map((feature) => (
                <label className="platform-feature-card" key={feature.key}>
                  <input
                    name={feature.key}
                    type="checkbox"
                    defaultChecked={featureEnabled(flags, feature.key)}
                    aria-describedby={`feature-${feature.key}`}
                  />
                  <span>
                    <strong>{feature.label}</strong>
                    <small id={`feature-${feature.key}`}>
                      {feature.description}
                    </small>
                  </span>
                </label>
              ))}
          </div>
        </fieldset>
      ))}
      <div className="platform-feature-essential">
        <strong>Sempre disponíveis</strong>
        <p>
          Perfil, ajuda, assinatura e acesso ao Super Admin permanecem
          disponíveis. Desativar uma página não apaga dados, encerra processos
          em andamento ou revoga as permissões da equipe.
        </p>
      </div>
    </div>
  );
}
