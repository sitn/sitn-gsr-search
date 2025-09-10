import cssText from "./styles.css?inline";
import type {
  FTSSearchResponse,
  IntersectionResponse,
  SearchSuggestion,
  OfficeInfo,
  GeoJSONFeatureCollection,
  FTSFeature,
  GSRFeature,
} from "./types";

const SEARCH_URL = "https://sitn.ne.ch/search?partitionlimit=2&query=";
const INTERSECTION_URL = "https://sitn.ne.ch/apps/action_sociale/intersection";

class SitnGsrSearch extends HTMLElement {
  private shadow: ShadowRoot;
  private searchInput!: HTMLInputElement;
  private suggestionsDropdown!: HTMLDivElement;
  private officeCard!: HTMLDivElement;
  private errorContainer!: HTMLDivElement;
  private tooltip!: HTMLDivElement;
  private searchTimeout: number | null = null;
  private abortController: AbortController | null = null;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.render();
    this.bindEvents();
  }

  private render(): void {
    const style = document.createElement("style");
    style.textContent = cssText;

    const container = document.createElement("div");
    container.innerHTML = `
      <div class="search-container" aria-label="Rechercher un guichet social régional par commune ou localité">
        <div class="search-wrapper">
          <input 
            type="text" 
            id="location-search"
            class="search-input" 
            placeholder="Entrez le nom de votre commune ou localité"
            autocomplete="off"
            spellcheck="false"
            aria-describedby="search-tooltip"
          />
          <div 
            id="search-tooltip"
            class="tooltip"
            role="tooltip"
            aria-live="polite"
          >
            Entrez le nom de votre commune ou localité
          </div>
        </div>
        <div class="suggestions-dropdown hidden"></div>
        <div class="error-message hidden"></div>
        <div class="office-card hidden"></div>
      </div>
    `;

    this.shadow.appendChild(style);
    this.shadow.appendChild(container);

    // Cache DOM elements
    this.searchInput = this.shadow.querySelector(
      ".search-input"
    ) as HTMLInputElement;
    this.suggestionsDropdown = this.shadow.querySelector(
      ".suggestions-dropdown"
    ) as HTMLDivElement;
    this.officeCard = this.shadow.querySelector(
      ".office-card"
    ) as HTMLDivElement;
    this.errorContainer = this.shadow.querySelector(
      ".error-message"
    ) as HTMLDivElement;
    this.tooltip = this.shadow.querySelector(
      ".tooltip"
    ) as HTMLDivElement;
  }

  private bindEvents(): void {
    this.searchInput.addEventListener(
      "input",
      this.handleSearchInput.bind(this)
    );
    this.searchInput.addEventListener("blur", this.handleInputBlur.bind(this));
    this.searchInput.addEventListener(
      "focus",
      this.handleInputFocus.bind(this)
    );

    // Close dropdown when clicking outside
    document.addEventListener("click", this.handleDocumentClick.bind(this));
  }

  private handleSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const query = target.value.trim();

    // Clear any existing timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Hide error and office card when new search starts
    this.hideError();
    this.hideOfficeCard();
    this.updateTooltipVisibility();

    if (query.length < 3) {
      this.hideSuggestions();
      return;
    }

    // Debounce the search
    this.searchTimeout = window.setTimeout(() => {
      this.performSearch(query);
    }, 300);
  }

  private handleInputBlur(): void {
    // Delay hiding suggestions to allow for clicks
    setTimeout(() => {
      this.hideSuggestions();
    }, 200);
  }

  private handleInputFocus(): void {
    const query = this.searchInput.value.trim();
    if (query.length >= 3) {
      this.performSearch(query);
    }
  }

  private handleDocumentClick(event: Event): void {
    if (!this.contains(event.target as Node)) {
      this.hideSuggestions();
    }
  }

  private updateTooltipVisibility(): void {
    const isEmpty = this.searchInput.value.trim() === "";
    if (isEmpty) {
      this.tooltip.classList.remove("hidden");
    } else {
      this.tooltip.classList.add("hidden");
    }
  }

  private async performSearch(query: string): Promise<void> {
    try {
      // Cancel any pending request
      if (this.abortController) {
        this.abortController.abort();
      }
      this.abortController = new AbortController();

      this.showLoading();

      const searchUrl = SEARCH_URL + encodeURIComponent(query);

      const response = await fetch(searchUrl, {
        signal: this.abortController.signal,
        headers: {
          Accept: "application/json",
        },
      });

      const data: FTSSearchResponse = await response.json();

      const filteredFeatures = data.features.filter(
        (feature) =>
          feature.properties.layer_name === "communes" ||
          feature.properties.layer_name === "localite" ||
          feature.properties.layer_name === "gsr002_guichet_social_regional"
      );

      const onlyCommunesFeatures = filteredFeatures.filter(
        (feature) => feature.properties.layer_name === "communes"
      );

      if (onlyCommunesFeatures.length === 0) {
        this.displaySuggestions(filteredFeatures);
      } else {
        this.displaySuggestions(onlyCommunesFeatures);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Request was cancelled, ignore
        return;
      }

      console.error("Erreur lors de la recherche:", error);
      this.showError(
        "Erreur lors de la recherche, veuillez nous contacter au 032 889 85 02."
      );
      this.hideSuggestions();
    }
  }

  private showLoading(): void {
    this.suggestionsDropdown.innerHTML =
      '<div class="loading">Recherche en cours...</div>';
    this.suggestionsDropdown.classList.remove("hidden");
  }

  private displaySuggestions(features: FTSFeature[]): void {
    if (features.length === 0) {
      this.suggestionsDropdown.innerHTML =
        '<div class="no-results">Cette commune ou localité n\'existe pas</div>';
      this.suggestionsDropdown.classList.remove("hidden");
      return;
    }

    const suggestions: SearchSuggestion[] = features.map((feature) => ({
      feature,
      displayText: feature.properties.label,
    }));

    this.suggestionsDropdown.innerHTML = "";

    suggestions.forEach((suggestion) => {
      const item = document.createElement("div");
      item.className = "suggestion-item";
      item.textContent = suggestion.displayText;
      item.addEventListener("click", () =>
        this.handleSuggestionClick(suggestion.feature)
      );
      this.suggestionsDropdown.appendChild(item);
    });

    this.suggestionsDropdown.classList.remove("hidden");
  }

  private async handleSuggestionClick(feature: FTSFeature): Promise<void> {
    try {
      this.hideSuggestions();
      this.hideError();

      // Update input with selected location
      this.searchInput.value = feature.properties.label;
      const intersectFeature: GeoJSONFeatureCollection = {
        type: "FeatureCollection",
        features: [feature],
      };

      // Call intersection service
      await this.fetchOfficeInfo(intersectFeature);
    } catch (error) {
      console.error("Error handling suggestion click:", error);
      this.showError(
        "Aucun guichet trouvé. Veuillez nous contacter au 032 889 85 02 "
      );
    }
  }

  private async fetchOfficeInfo(
    pointFeatureCollection: GeoJSONFeatureCollection
  ): Promise<void> {
    const response = await fetch(INTERSECTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(pointFeatureCollection),
    });

    const data: IntersectionResponse = await response.json();

    if (data.features.length === 0) {
      this.showError(
        `Aucun guichet trouvé pour les coordonnée ${pointFeatureCollection.features[0].geometry.coordinates}`
      );
      return;
    }

    // Use the first feature
    const officeFeature = data.features[0];
    this.displayOfficeInfo(officeFeature);
  }

  private displayOfficeInfo(feature: GSRFeature): void {
    const properties = feature.properties;

    const officeInfo: OfficeInfo = {
      nom_gsr: properties.nom_gsr || "",
      numero_telephone: properties.numero_telephone || "",
      email: properties.email || "",
      form_prise_contact: properties.form_prise_contact || "",
      informations: properties.informations || "",
      adresse: properties.adresse.split(" - ")[0] || properties.adresse,
      localite: properties.adresse.split(" - ")[1] || "",
      google_maps: properties.google_maps || "",
    };

    const hasValidInfo = Object.values(officeInfo).some(
      (value) => value && value.trim() !== ""
    );

    if (!hasValidInfo) {
      this.showError(
        "Malheureusement aucun service n'a été trouvé pour cet emplacement."
      );
      return;
    }

    this.officeCard.innerHTML = `
      <h3>${officeInfo.nom_gsr || "Guichet social régional"}</h3>
      <div class="office-info">
        <div class="flex">
          <div class="info-value">${this.escapeHtml(officeInfo.adresse)}<br>
            ${this.escapeHtml(officeInfo.localite)}<br>
          </div>
          <div class="info-value">
            <a href="${this.escapeHtml(officeInfo.google_maps)}" target="_blank" rel="noopener noreferrer">
              <span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-sign-turn-right" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M5 8.5A2.5 2.5 0 0 1 7.5 6H9V4.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L9.41 8.658A.25.25 0 0 1 9 8.466V7H7.5A1.5 1.5 0 0 0 6 8.5V11H5z"/>
                  <path fill-rule="evenodd" d="M6.95.435c.58-.58 1.52-.58 2.1 0l6.515 6.516c.58.58.58 1.519 0 2.098L9.05 15.565c-.58.58-1.519.58-2.098 0L.435 9.05a1.48 1.48 0 0 1 0-2.098zm1.4.7a.495.495 0 0 0-.7 0L1.134 7.65a.495.495 0 0 0 0 .7l6.516 6.516a.495.495 0 0 0 .7 0l6.516-6.516a.495.495 0 0 0 0-.7L8.35 1.134Z"/>
                </svg>
              </span>
              Itinéraire
            </a>
          </div>
        </div>

        <hr>

        <div class="flex">
          <div class="info-value">
            ${this.escapeHtml(officeInfo.numero_telephone)}
          </div>
          <div class="info-value">
            <a href="tel:${this.escapeHtml(officeInfo.numero_telephone)}">
              <span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-telephone" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.6 17.6 0 0 0 4.168 6.608 17.6 17.6 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.68.68 0 0 0-.58-.122l-2.19.547a1.75 1.75 0 0 1-1.657-.459L5.482 8.062a1.75 1.75 0 0 1-.46-1.657l.548-2.19a.68.68 0 0 0-.122-.58zM1.884.511a1.745 1.745 0 0 1 2.612.163L6.29 2.98c.329.423.445.974.315 1.494l-.547 2.19a.68.68 0 0 0 .178.643l2.457 2.457a.68.68 0 0 0 .644.178l2.189-.547a1.75 1.75 0 0 1 1.494.315l2.306 1.794c.829.645.905 1.87.163 2.611l-1.034 1.034c-.74.74-1.846 1.065-2.877.702a18.6 18.6 0 0 1-7.01-4.42 18.6 18.6 0 0 1-4.42-7.009c-.362-1.03-.037-2.137.703-2.877z"/>
                </svg>
              </span>
              Appeler
            </a>
          </div>
        </div>

        <hr>

        <div class="flex">

          <div class="info-value">
            <a href="${this.escapeHtml(officeInfo.form_prise_contact)}" target="_blank" rel="noopener noreferrer">
              <span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-envelope" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v.217l7 4.2 7-4.2V4a1 1 0 0 0-1-1zm13 2.383-4.708 2.825L15 11.105zm-.034 6.876-5.64-3.471L8 9.583l-1.326-.795-5.64 3.47A1 1 0 0 0 2 13h12a1 1 0 0 0 .966-.741M1 11.105l4.708-2.897L1 5.383z"/>
                </svg>
                Nous écrire
              </span>
            </a>
          </div>

          <div class="info-value">
            <a href="${this.escapeHtml(officeInfo.informations)}" target="_blank" rel="noopener noreferrer">
              <span class="icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-info-circle" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
                  <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/>
                </svg>
                Informations et horaires
              </span>
            </a>
          </div>

        </div>
      </div>
    `;

    this.officeCard.classList.remove("hidden");
  }

  private hideSuggestions(): void {
    this.suggestionsDropdown.classList.add("hidden");
  }

  private hideOfficeCard(): void {
    this.officeCard.classList.add("hidden");
  }

  private showError(message: string): void {
    this.errorContainer.textContent = message;
    this.errorContainer.classList.remove("hidden");
  }

  private hideError(): void {
    this.errorContainer.classList.add("hidden");
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  disconnectedCallback(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    if (this.abortController) {
      this.abortController.abort();
    }
    document.removeEventListener("click", this.handleDocumentClick.bind(this));
  }
}

customElements.define("sitn-gsr-search", SitnGsrSearch);

export default SitnGsrSearch;
