import { ItemView, WorkspaceLeaf, TFile } from "obsidian";

export const VELOCITY_VIEW_TYPE = "gardener-velocity";

const WEEKS = 12;

interface WeekBucket {
  label: string;   // "Jun 1"
  created: number;
  modified: number;
}

export class WritingVelocityView extends ItemView {
  getViewType(): string { return VELOCITY_VIEW_TYPE; }
  getDisplayText(): string { return "Gardener: Velocity"; }
  getIcon(): string { return "trending-up"; }

  async onOpen(): Promise<void> {
    this.registerEvent(
      this.app.vault.on("modify", () => this.render())
    );
    await this.render();
  }

  async onClose(): Promise<void> {}

  async render(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gardener-velocity-view");

    contentEl.createEl("h2", { text: "Writing Velocity", cls: "gardener-section-title" });
    contentEl.createEl("p", {
      text: "Notes created and edited per week — last 12 weeks.",
      cls: "gardener-velocity-subtitle",
    });

    const buckets = this.buildBuckets();
    await this.populateBuckets(buckets);

    const svg = this.buildSVG(buckets);
    contentEl.appendChild(svg);

    // Legend
    const legend = contentEl.createDiv("gardener-velocity-legend");
    const mkLegend = (cls: string, label: string) => {
      const item = legend.createDiv("gardener-velocity-legend-item");
      item.createDiv(cls);
      item.createSpan({ text: label });
    };
    mkLegend("gardener-velocity-swatch gardener-velocity-created", "New notes");
    mkLegend("gardener-velocity-swatch gardener-velocity-modified", "Edited notes");
  }

  private buildBuckets(): WeekBucket[] {
    const now = Date.now();
    const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
    const buckets: WeekBucket[] = [];
    for (let i = WEEKS - 1; i >= 0; i--) {
      const start = now - (i + 1) * MS_WEEK;
      const d = new Date(start);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      buckets.push({ label, created: 0, modified: 0 });
    }
    return buckets;
  }

  private async populateBuckets(buckets: WeekBucket[]): Promise<void> {
    const now = Date.now();
    const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
    const windowStart = now - WEEKS * MS_WEEK;

    for (const file of this.app.vault.getMarkdownFiles()) {
      const { ctime, mtime } = file.stat;

      if (ctime >= windowStart) {
        const weekIdx = Math.floor((now - ctime) / MS_WEEK);
        const bucketIdx = WEEKS - 1 - weekIdx;
        if (bucketIdx >= 0 && bucketIdx < WEEKS) buckets[bucketIdx].created++;
      }

      if (mtime >= windowStart && mtime !== ctime) {
        const weekIdx = Math.floor((now - mtime) / MS_WEEK);
        const bucketIdx = WEEKS - 1 - weekIdx;
        if (bucketIdx >= 0 && bucketIdx < WEEKS) buckets[bucketIdx].modified++;
      }
    }
  }

  private buildSVG(buckets: WeekBucket[]): SVGElement {
    const W = 560, H = 200;
    const PAD_L = 36, PAD_R = 12, PAD_T = 16, PAD_B = 48;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    const maxVal = Math.max(1, ...buckets.map((b) => b.created + b.modified));
    const barW = chartW / WEEKS;
    const halfBar = barW * 0.35;

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", "100%");
    svg.classList.add("gardener-velocity-svg");

    const yLabel = (val: number) => {
      const y = PAD_T + chartH - (val / maxVal) * chartH;
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", String(PAD_L));
      line.setAttribute("x2", String(PAD_L + chartW));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.classList.add("gardener-velocity-grid");
      svg.appendChild(line);

      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", String(PAD_L - 4));
      text.setAttribute("y", String(y + 4));
      text.setAttribute("text-anchor", "end");
      text.classList.add("gardener-velocity-axis-label");
      text.textContent = String(val);
      svg.appendChild(text);
    };

    yLabel(0);
    yLabel(Math.ceil(maxVal / 2));
    yLabel(maxVal);

    buckets.forEach((b, i) => {
      const x = PAD_L + i * barW + barW / 2;

      // modified (background)
      const totalH = ((b.created + b.modified) / maxVal) * chartH;
      if (b.modified > 0 || b.created > 0) {
        const modRect = document.createElementNS(ns, "rect");
        modRect.setAttribute("x", String(x - halfBar));
        modRect.setAttribute("y", String(PAD_T + chartH - totalH));
        modRect.setAttribute("width", String(halfBar * 2));
        modRect.setAttribute("height", String(totalH));
        modRect.classList.add("gardener-velocity-bar", "gardener-velocity-bar-modified");
        svg.appendChild(modRect);
      }

      // created (foreground, stacked on top)
      const createdH = (b.created / maxVal) * chartH;
      if (b.created > 0) {
        const createdRect = document.createElementNS(ns, "rect");
        createdRect.setAttribute("x", String(x - halfBar));
        createdRect.setAttribute("y", String(PAD_T + chartH - createdH));
        createdRect.setAttribute("width", String(halfBar * 2));
        createdRect.setAttribute("height", String(createdH));
        createdRect.classList.add("gardener-velocity-bar", "gardener-velocity-bar-created");
        svg.appendChild(createdRect);
      }

      // x-axis label — every 3 weeks to avoid crowding
      if (i % 3 === 0) {
        const label = document.createElementNS(ns, "text");
        label.setAttribute("x", String(x));
        label.setAttribute("y", String(H - PAD_B + 14));
        label.setAttribute("text-anchor", "middle");
        label.classList.add("gardener-velocity-axis-label");
        label.textContent = b.label;
        svg.appendChild(label);
      }
    });

    return svg as unknown as SVGElement;
  }
}
