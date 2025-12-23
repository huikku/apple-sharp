# FinalPoint Design System v3

**For:** Developers & AI Coding Agents  
**Theme:** Tactical Dark (shadcn/ui + Custom Accents)

---

## 1. Core Principles

1. **High Contrast & Legibility** – Critical data pops against dark backgrounds
2. **No Decorative Gradients** – Solid colors, subtle glass effects only
3. **Industrial Framing** – 1px borders, instrument-panel aesthetic
4. **Semantic Color** – Green=Good, Amber=Warn, Red=Critical, Blue=Info
5. **Micro-Interactions** – Hover states brighten elements

---

## 2. Fonts

| Purpose | Family | Weights |
|---------|--------|---------|
| Display (titles, panel headers) | Barlow Condensed | 600, 700 |
| Body / UI | Barlow | 400, 500, 600 |
| Code / Telemetry | JetBrains Mono | 400, 500 |

Load via Google Fonts or self-host.

---

## 3. Tailwind Configuration

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        display: ['"Barlow Condensed"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Barlow', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
}
```

---

## 4. CSS Variables (globals.css)

Single source of truth. shadcn components use `bg-background`, `text-foreground`, etc.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* === FinalPoint Base Palette === */
  --fp-void: #0A0C0E;
  --fp-plate: #14171C;
  --fp-frame: #1E2328;
  --fp-text: #C1C5C8;
  --fp-text-muted: #6F7477;
  --fp-metal-base: #6F7477;
  --fp-metal-trim: #464B4E;
  --fp-metal-highlight: #C1C5C8;

  /* === Accent Colors (Active / Idle) === */
  --fp-green-active: #3FFF59;
  --fp-green-idle: #1C8E32;
  --fp-amber-active: #E79C35;
  --fp-amber-idle: #A06715;
  --fp-red-active: #C32D2D;
  --fp-red-idle: #6C1B1B;
  --fp-blue-active: #68A9EC;
  --fp-blue-idle: #305575;

  /* === shadcn Token Mapping === */
  --background: var(--fp-void);
  --foreground: var(--fp-text);
  --card: var(--fp-frame);
  --card-foreground: var(--fp-text);
  --popover: var(--fp-plate);
  --popover-foreground: var(--fp-text);
  --primary: var(--fp-blue-active);
  --primary-foreground: #ffffff;
  --secondary: var(--fp-plate);
  --secondary-foreground: var(--fp-text);
  --muted: var(--fp-plate);
  --muted-foreground: var(--fp-text-muted);
  --accent: var(--fp-frame);
  --accent-foreground: var(--fp-text);
  --destructive: var(--fp-red-active);
  --destructive-foreground: #ffffff;
  --border: var(--fp-metal-trim);
  --input: var(--fp-metal-trim);
  --ring: var(--fp-blue-active);
  --radius: 0.375rem;
}

@layer base {
  body {
    @apply font-sans text-foreground bg-background;
  }
  h1, h2, h3, h4, h5, h6 {
    @apply font-display tracking-tight;
  }
  code, pre, kbd {
    @apply font-mono;
  }
}

@layer utilities {
  .text-success { color: var(--fp-green-active); }
  .text-success-idle { color: var(--fp-green-idle); }
  .text-warning { color: var(--fp-amber-active); }
  .text-warning-idle { color: var(--fp-amber-idle); }
  .text-critical { color: var(--fp-red-active); }
  .text-critical-idle { color: var(--fp-red-idle); }
  .text-info { color: var(--fp-blue-active); }
  .text-info-idle { color: var(--fp-blue-idle); }
  
  .bg-success { background-color: var(--fp-green-active); }
  .bg-warning { background-color: var(--fp-amber-active); }
  .bg-critical { background-color: var(--fp-red-active); }
  .bg-info { background-color: var(--fp-blue-active); }
}
```

---

## 5. Component Patterns

Use shadcn token classes. Avoid inventing parallel color systems.

```tsx
// Display title (Barlow Condensed)
<h1 className="font-display text-4xl tracking-tight">FinalPoint</h1>

// Panel title
<CardTitle className="font-display tracking-tight">Telemetry</CardTitle>

// Muted label
<span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>

// Telemetry value
<span className="font-mono text-base">48.2°</span>

// Status indicators
<span className="text-success">ONLINE</span>
<span className="text-warning">DEGRADED</span>
<span className="text-critical">OFFLINE</span>
```

### Panel Styling
- Surface: `bg-card`
- Border: `border border-border`
- Glass overlay: `bg-card/90 backdrop-blur-sm`
- Rounding: `rounded-md` (outer), `rounded-sm` (inner). Never `rounded-xl`.

---

## 6. Typography Scale

| Class | Size | Use |
|-------|------|-----|
| `text-xs` | 12px | Metadata, timestamps |
| `text-sm` | 14px | Body, buttons, inputs |
| `text-base` | 16px | Section headers, values |
| `text-lg` | 18px | Panel titles, KPIs |
| `text-xl+` | 20px+ | Rare – alerts, HUD counters |

- **Uppercase labels:** Always use `tracking-wider` or `tracking-widest`
- **Mono numbers:** `tracking-tight` if space-constrained

---

## 7. Developer & Agent Workflow

### Dependencies
- Use project's existing build setup (Vite, Next.js, etc.)
- Do NOT install conflicting CSS frameworks
- Do NOT use Node.js APIs (`fs`, `path`) in browser code

### Code Style
- Functional React components with Hooks
- Explicit TypeScript interfaces for all props
- `useEffect` cleanup for listeners/subscriptions

### Architecture
- **UI** → `components/`
- **Logic** → `services/` or `contexts/`
- Reuse existing components before creating new ones

---

## 8. Tone & Copy

**Voice:** Professional, concise, military-standard.

| ✅ Good | ❌ Bad |
|---------|--------|
| Mission Aborted | Oops, something went wrong |
| Link Established | You're connected! |
| Target Acquired | Click here to continue |
| System Nominal | Everything looks good |

---

## 9. Acceptance Checklist

- [ ] `body` renders in Barlow
- [ ] `h1–h6` render in Barlow Condensed
- [ ] `code/pre/kbd` render in JetBrains Mono
- [ ] Accent colors (success/warning/critical/info) work
- [ ] shadcn components use correct dark theme

