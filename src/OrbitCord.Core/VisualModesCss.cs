namespace OrbitCord.Core;

public static class VisualModesCss
{
    public const string BaseElementId = "orbitcord-base-style";
    public const string UltraElementId = "orbitcord-ultra-style";

    public static string EnableBaseScript => $$"""
        (() => {
          const id = '{{BaseElementId}}';
          let style = document.getElementById(id);
          if (!style) {
            style = document.createElement('style');
            style.id = id;
            document.documentElement.appendChild(style);
          }
          style.textContent = `
            *, *::before, *::after {
              scroll-behavior: auto !important;
            }
            * {
              text-shadow: none !important;
            }
            * {
              backdrop-filter: none !important;
            }
          `;
          document.documentElement.dataset.orbitcordBase = '1';
        })();
        """;

    public static string DisableBaseScript => $$"""
        (() => {
          document.getElementById('{{BaseElementId}}')?.remove();
          delete document.documentElement.dataset.orbitcordBase;
        })();
        """;

    public static string EnableUltraScript => $$"""
        (() => {
          const id = '{{UltraElementId}}';
          let style = document.getElementById(id);
          if (!style) {
            style = document.createElement('style');
            style.id = id;
            document.documentElement.appendChild(style);
          }
          style.textContent = `
            *, *::before, *::after {
              animation-duration: 0.001ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.001ms !important;
              text-shadow: none !important;
              box-shadow: none !important;
              backdrop-filter: none !important;
              filter: none !important;
              scroll-behavior: auto !important;
            }
          `;
          document.documentElement.dataset.orbitcordUltra = '1';
        })();
        """;

    public static string DisableUltraScript => $$"""
        (() => {
          document.getElementById('{{UltraElementId}}')?.remove();
          delete document.documentElement.dataset.orbitcordUltra;
        })();
        """;
}
