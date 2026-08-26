const behaviors = new Map()

export const registerBehaviors = (modules) => {
  Object.entries(modules).forEach(([path, module]) => {
    const name = path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase()
    behaviors.set(name, module.init ?? module.default)
  })
}

export const mountBehavior = (name, element, context) => {
  const init = behaviors.get(name.toLowerCase())
  if (!init) return null
  const cleanup = init(element, context)
  return typeof cleanup === 'function' ? cleanup : null
}
