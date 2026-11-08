# Laboratory interface experiment

Branch: `design/laboratory-welcome-refinement`. Presentation-only changes; extraction, confidence, storage, and CSV logic are unchanged. Scan remains the default route. The Welcome navigation item and logo open `/welcome`.

## Existing framework

React 18.3, TypeScript, Vite 6, Mantine 7, React Router, TanStack Query/Table, and Lucide icons. No Three.js or WebGL dependency was previously required.

## Dependency review

Reviewed upstream sources on November 7, 2026:

| Candidate | Compatibility / licensing | Decision |
| --- | --- | --- |
| [Shader Gradient](https://github.com/ruucm/shadergradient/blob/main/README.md) | Its [package manifest](https://github.com/ruucm/shadergradient/blob/main/packages/shadergradient/package.json) declares MIT, React 18/19 peers, Three.js and React Three Fiber. React 18 requires Fiber 8. The README also installs three-stdlib and camera-controls. | Technically compatible with matching versions. Extra WebGL rendering and dependencies are disproportionate to this restrained background accent; use native CSS instead. No runtime benchmark of this library was performed. |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | MIT; upstream documents Fiber 8 for React 18 and Fiber 9 for React 19. | Not needed for a 2D gradient. |
| [Liquid Glass JS](https://github.com/dashersw/liquid-glass-js) | MIT; vanilla JavaScript/WebGL 2 with html2canvas page sampling. No native React component integration shown in its README. | Not installed: refraction and page sampling do not serve this interface. |
| [Liquid Logo](https://github.com/collidingScopes/liquid-logo) | GitHub repository metadata identifies MIT. | Not installed, as requested. Preserve the supplied MRG logo. |

No dependencies or lockfiles changed. CSS radial/linear gradients provide a static baseline without WebGL, remote assets, or a JavaScript render loop. Only the decorative layer's transform moves, on a 26-second alternating cycle. A Pause control is available. Both the system reduced-motion preference and the application's saved preference disable motion; no JavaScript is necessary for the CSS fallback.

## Interface decisions

- White application shell, navy headings, restrained green selection and actions.
- No fake sample counts or placeholder functionality on Welcome.
- Large action targets and visible keyboard focus outlines.
- Animation stays within the welcome background; earlier decorative entrance/status animations are disabled on working screens. Functional loading indicators are retained.
- Pause removes background movement. Navigation unmounts the accent, so working pages carry no animated background.
- Verify desktop and narrow layouts, keyboard focus, pause/resume, and reduced motion before promotion to main.
