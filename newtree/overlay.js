const resolve = (target) => typeof target === 'string' ? document.querySelector(target) : target

export const portal = (node, target) => {
  const root = resolve(target)
  if (root && node.parentElement !== root) root.append(node)
  return node
}

export const tooltip = (anchor, title, body) => {
  const node = document.createElement('div')
  node.className = 'tooltip'
  node.setAttribute('role', 'tooltip')
  node.innerHTML = `<strong>${title}</strong><span>${body}</span>`
  document.body.append(node)
  const box = anchor.getBoundingClientRect()
  const half = node.offsetWidth / 2
  const left = Math.min(Math.max(box.left + (box.width / 2), half + 8), window.innerWidth - half - 8)
  const above = box.top - node.offsetHeight - 8
  node.style.left = `${left}px`
  node.style.top = `${above < 8 ? box.bottom + 8 : box.top - 8}px`
  node.classList.toggle('tooltip-below', above < 8)
  requestAnimationFrame(() => node.classList.add('is-visible'))
  return () => node.remove()
}
