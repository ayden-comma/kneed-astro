import Image from '@tiptap/extension-image';

// Shared TipTap image node used by BOTH admin editors (bakeries + campaigns).
// It augments the stock Image extension with two attributes, persisted as
// data-attributes on the <img> plus a `tiptap-img-<size>` class so the .tiptap-img-*
// rules in public/admin.css preview the chosen size live in the editor:
//   • size  → small | medium | large | full   (default 'full')
//   • align → left  | center | right           (default 'center')
export const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      size: {
        default: 'full',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-size') || 'full',
        renderHTML: (attributes: Record<string, any>) => ({
          'data-size': attributes.size,
          class: (attributes.class || '') + ' tiptap-img-' + attributes.size,
        }),
      },
      align: {
        default: 'center',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-align') || 'center',
        renderHTML: (attributes: Record<string, any>) => ({
          'data-align': attributes.align,
        }),
      },
    };
  },
});
