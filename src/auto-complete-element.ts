import Autocomplete from './autocomplete.js'
const HTMLElement = globalThis.HTMLElement || (null as unknown as (typeof window)['HTMLElement'])

type AutoCompleteEventInit = EventInit & {
  relatedTarget: HTMLInputElement
}

export class AutoCompleteEvent extends Event {
  relatedTarget: HTMLInputElement

  constructor(type: 'auto-complete-change', {relatedTarget, ...init}: AutoCompleteEventInit) {
    super(type, init)
    this.relatedTarget = relatedTarget
  }
}

const state = new WeakMap()

export interface CSPTrustedTypesPolicy {
  createHTML: (s: string, response: Response) => CSPTrustedHTMLToStringable
}

// Note: basically every object (and some primitives) in JS satisfy this
// `CSPTrustedHTMLToStringable` interface, but this is the most compatible shape
// we can use.
interface CSPTrustedHTMLToStringable {
  toString: () => string
}

let cspTrustedTypesPolicyPromise: Promise<CSPTrustedTypesPolicy> | null = null

export class AutoCompleteElement extends HTMLElement {
  static define(tag = 'auto-complete', registry = customElements) {
    registry.define(tag, this)
    return this
  }

  static setCSPTrustedTypesPolicy(policy: CSPTrustedTypesPolicy | Promise<CSPTrustedTypesPolicy> | null): void {
    cspTrustedTypesPolicyPromise = policy === null ? policy : Promise.resolve(policy)
  }

  #forElement: HTMLElement | null = null
  get forElement(): HTMLElement | null {
    if (this.#forElement?.isConnected) {
      return this.#forElement
    }
    const id = this.getAttribute('for')
    const root = this.getRootNode()
    if (id && (root instanceof Document || root instanceof ShadowRoot)) {
      return root.getElementById(id)
    }
    return null
  }

  set forElement(element: HTMLElement | null) {
    this.#forElement = element
    this.setAttribute('for', '')
  }

  #inputElement: HTMLInputElement | null = null
  get inputElement(): HTMLInputElement | null {
    if (this.#inputElement?.isConnected) {
      return this.#inputElement
    }
    return this.querySelector<HTMLInputElement>('input')
  }

  set inputElement(input: HTMLInputElement | null) {
    this.#inputElement = input
    this.#reattachState()
  }

  #hiddenInputElement: HTMLInputElement | null = null
  get hiddenInputElement(): HTMLInputElement | null {
    if (this.#hiddenInputElement?.isConnected) {
      return this.#hiddenInputElement
    }
    return this.querySelector<HTMLInputElement>("input[type='hidden']")
  }

  set hiddenInputElement(input: HTMLInputElement | null) {
    this.#hiddenInputElement = input
    this.#reattachState()
  }

  connectedCallback(): void {
    if (!this.isConnected) return
    this.#reattachState()
  }

  disconnectedCallback(): void {
    const autocomplete = state.get(this)
    if (autocomplete) {
      autocomplete.destroy()
      state.delete(this)
    }
  }

  #reattachState() {
    state.get(this)?.destroy()
    const {forElement, inputElement, hiddenInputElement} = this
    if (!forElement || !inputElement) return
    const autoselectEnabled = this.getAttribute('data-autoselect') === 'true'
    state.set(this, new Autocomplete(this, inputElement, hiddenInputElement, forElement, autoselectEnabled))
    forElement.setAttribute('role', 'listbox')
  }

  get src(): string {
    return this.getAttribute('src') || ''
  }

  set src(url: string) {
    this.setAttribute('src', url)
  }

  get value(): string {
    return this.getAttribute('value') || ''
  }

  set value(value: string) {
    this.setAttribute('value', value)
  }

  get dataValue(): string {
    return this.getAttribute('data-value') || ''
  }

  set dataValue(dataValue: string) {
    this.setAttribute('data-value', dataValue)
  }

  get open(): boolean {
    return this.hasAttribute('open')
  }

  set open(value: boolean) {
    if (value) {
      this.setAttribute('open', '')
    } else {
      this.removeAttribute('open')
    }
  }

  // HEAD
  get fetchOnEmpty(): boolean {
    return this.hasAttribute('fetch-on-empty')
  }

  set fetchOnEmpty(fetchOnEmpty: boolean) {
    this.toggleAttribute('fetch-on-empty', fetchOnEmpty)
  }

  #requestController?: AbortController
  async fetchResult(url: URL): Promise<string | CSPTrustedHTMLToStringable> {
    this.#requestController?.abort()
    const {signal} = (this.#requestController = new AbortController())
    const res = await fetch(url.toString(), {
      signal,
      headers: {
        Accept: 'text/fragment+html',
      },
    })
    if (!res.ok) {
      throw new Error(await res.text())
    }
    if (cspTrustedTypesPolicyPromise) {
      const cspTrustedTypesPolicy = await cspTrustedTypesPolicyPromise
      return cspTrustedTypesPolicy.createHTML(await res.text(), res)
    }
    return await res.text()
  }
  //f21528e (add csp trusted types policy)
  static get observedAttributes(): string[] {
    return ['open', 'value', 'for', 'data-value']
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
    if (oldValue === newValue) return

    const autocomplete = state.get(this)
    if (!autocomplete) return

    if (this.forElement !== state.get(this)?.results || this.inputElement !== state.get(this)?.input) {
      this.#reattachState()
    }

    switch (name) {
      case 'open':
        newValue === null ? autocomplete.close() : autocomplete.open()
        break
      case 'data-value':
        autocomplete.hiddenInput.value = newValue
        break
      case 'value':
        if (newValue !== null) {
          autocomplete.input.value = newValue
        }
        this.dispatchEvent(
          new AutoCompleteEvent('auto-complete-change', {
            bubbles: true,
            relatedTarget: autocomplete.input,
          }),
        )
        break
    }
  }
}

export default AutoCompleteElement
