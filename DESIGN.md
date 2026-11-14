# Tender Fit Radar design system

## Direction

The entry page is a brand experience: an open Nordic sky, orange surveying instrument, and civic architecture convey seeing the next opportunity. Its centered composition, contrasting typography, playful physical imagery, and tactile actions respond to the user's explicit Corgi reference. The results workspace uses the precise task hierarchy and readable controls expected of Context.dev and BoardUI.

## Color and typography

Use vivid orange for identity and selected actions, dark orange for accessible small text, near-black ink, white surfaces, and natural sky blue in the artwork. Blue communicates supported evidence; amber means review; muted red means possible gaps. No green or purple branding.

Manrope carries the interface and sans-serif headings. Bodoni Moda italic provides deliberate contrast in brand headlines. Geist Mono is limited to utility data. Font variables live on the HTML element so dependent design tokens resolve correctly.

## Layout and interaction

The landing page has a centered, image-led hero, a direct supplier website form, a source strip, an interactive requirement comparison, two illustrated research workflows, and an orange closing invitation. Demo and live research stay distinct. Place loading and errors next to the initiating form.

The workspace keeps a company header, opportunity/profile/changes views, a selectable shortlist, and paired requirement evidence. Favor open rows and separators, comfortable text sizes, and 8–12px panel corners. Collapse columns on mobile. Keep a single h1 and sequential heading levels.

The hero image belongs exclusively to the landing page. Research results use plain neutral surfaces. Preserve the artwork's horizontal composition rather than zooming/cropping it to fill a tall container. Keep the removed announcement and research-duration note out of the entry page.

The shared graphic language is layered paper, vivid orange optical elements, source capsules and evidence marks. Homepage illustrations use an oversized source conveyor and an evidence lens with continuous document throughput. Deep shadows, overlapping surfaces and occlusion give the illustrations physical depth. The workspace uses an abbreviated version of those details.

Illustrative content follows the fictional Northline dataset used by the sample workspace. The supplier sheet shows its actual demo services, references and resources. Lens tiles pair tender requirements with the corresponding supplier evidence; absent public evidence remains a request for confirmation. These examples do not claim real procurement results.

## Motion

Short tactile action feedback and state changes, with no invented research progress. Preserve reduced-motion support. Brand interactions may be more expressive than workspace interactions, but never delay typing or selection.

Live research adapts BoardUI's free AgentThinking and AgentLog primitives. Server-sent events drive actual stage states and source updates. Decorative source-flow motion can be paused without interrupting research. Explanatory homepage loops also have a visible pause control and meaningful static reduced-motion states.

Keep the primary explanatory content stable and use large graphic elements for expressive motion. The source conveyor repeats two identical groups with a mathematically matching seam. Evidence actors move continuously through a shared space and recycle beyond its clipped edges. Avoid synchronized build/erase loops, empty holds and visible resets. Animate transforms and opacity; static lighting and shadows provide the material detail. The elapsed timer renders independently of the live feed, so clock ticks never trigger log layout measurement.

## Generated artwork

Asset: `public/images/opportunity-sky.webp` (1672 × 941; approximately 99 KB). Generated with the built-in ImageGen tool, then encoded as WebP for the website. The original remains in the local generated-images library.

Final generation prompt:

> Use case: ads-marketing. Create an exceptionally art-directed wide cinematic website hero background for an original Finnish public procurement product, Tender Fit Radar. This is ONLY an image asset, NO text and NO UI. Wide 16:9 composition. Atmosphere: a luminous pale blue Nordic morning sky with natural soft white clouds, desaturated clean sunlight, sophisticated surreal photographic collage with realistically crafted miniature architecture. Absolutely preserve the central 58% of the image and upper center as open, pale, quiet sky, for a black website headline and form that will be overlaid in code. At the extreme lower left: a beautifully detailed orange metal surveyor's optical telescope on a slim tripod, pointing toward the far right, slightly surreal oversized design object, warm vermilion enamel and brushed metal. At the lower right corner: a small architectural model of a Nordic civic building renovation, elegant pale stone, wood, glass, a small vivid orange construction crane and a few tiny nordic trees, on an organic white plaster terrain base. The telescope and miniature buildings should each occupy only the outer 22% of the frame and the lower 38% of the image, leaving the entire middle completely free. Add at most two small folded white tender-paper sheets drifting near the upper far-right edge, with no visible writing. Real material detail and crisp lighting, premium playful visual identity, physical studio models photographically composited into an airy cloudscape. Restrained palette of sky azure, soft white, charcoal tiny details, and saturated tangerine-orange #f36a2e. The asset should feel like a commissioned high-end digital brand campaign, full of space and calm optimism. No gradients-as-objects, no generic 3D blobs, no isometric infographic, no cartoon outlines, no dog, no corgi, no purple, no green brand color, no typography, no text, no symbols, no logos, no watermark. Natural sky should fill edge to edge; at the very bottom gently blend toward near white clouds.
