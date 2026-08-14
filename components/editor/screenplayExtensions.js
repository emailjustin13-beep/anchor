import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { SCREENPLAY_ELEMENT_ORDER, SCREENPLAY_ELEMENTS, normalizeElementType } from '../../lib/screenplay'

export const ScreenplayParagraph = Node.create({
  name: 'screenplayParagraph',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      elementType: {
        default: 'action',
        parseHTML: element => normalizeElementType(element.getAttribute('data-screenplay-element')),
        renderHTML: attributes => ({ 'data-screenplay-element': normalizeElementType(attributes.elementType) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'p[data-screenplay-element]' }, { tag: 'p' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const elementType = normalizeElementType(node.attrs.elementType)
    return ['p', mergeAttributes(HTMLAttributes, {
      'data-screenplay-element': elementType,
      class: `screenplay-element screenplay-${elementType}`,
    }), 0]
  },

  addCommands() {
    return {
      setScreenplayElement: elementType => ({ commands }) => commands.updateAttributes(this.name, {
        elementType: normalizeElementType(elementType),
      }),
    }
  },
})

function activeType(editor) {
  return normalizeElementType(editor.getAttributes('screenplayParagraph').elementType)
}

function changeElement(editor, type) {
  const applied = editor.chain().focus().setScreenplayElement(type).run()
  if (applied && type === 'parenthetical') {
    const { $from } = editor.state.selection
    if ($from.parent.content.size === 0) editor.chain().insertContent('()').setTextSelection($from.pos + 1).run()
  }
  return applied
}

export const ScreenplayKeyboard = Extension.create({
  name: 'screenplayKeyboard',

  addKeyboardShortcuts() {
    const shortcuts = {
      Enter: () => {
        const type = activeType(this.editor)
        const next = SCREENPLAY_ELEMENTS[type]?.next || 'action'
        return this.editor.chain().focus().splitBlock().setScreenplayElement(next).run()
      },
      Tab: () => {
        const type = activeType(this.editor)
        const index = SCREENPLAY_ELEMENT_ORDER.indexOf(type)
        return changeElement(this.editor, SCREENPLAY_ELEMENT_ORDER[(index + 1) % SCREENPLAY_ELEMENT_ORDER.length])
      },
      'Shift-Tab': () => {
        const type = activeType(this.editor)
        const index = SCREENPLAY_ELEMENT_ORDER.indexOf(type)
        return changeElement(this.editor, SCREENPLAY_ELEMENT_ORDER[(index - 1 + SCREENPLAY_ELEMENT_ORDER.length) % SCREENPLAY_ELEMENT_ORDER.length])
      },
    }
    SCREENPLAY_ELEMENT_ORDER.forEach((type, index) => {
      shortcuts[`Mod-${index + 1}`] = () => changeElement(this.editor, type)
    })
    return shortcuts
  },
})
