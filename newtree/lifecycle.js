const routeHandlers = new Set()
const scrollHandlers = new Set()
const resizeHandlers = new Set()
let scrollFrame = 0
let resizeFrame = 0

export const onRoute = (handler) => {
  routeHandlers.add(handler)
  return () => routeHandlers.delete(handler)
}

export const emitRoute = (route) => routeHandlers.forEach((handler) => handler(route))

export const onScroll = (handler) => {
  scrollHandlers.add(handler)
  return () => scrollHandlers.delete(handler)
}

export const onResize = (handler) => {
  resizeHandlers.add(handler)
  return () => resizeHandlers.delete(handler)
}

addEventListener('scroll', () => {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    scrollHandlers.forEach((handler) => handler({ x: scrollX, y: scrollY }))
  })
}, { passive: true })

addEventListener('resize', () => {
  if (resizeFrame) return
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0
    resizeHandlers.forEach((handler) => handler({ width: innerWidth, height: innerHeight }))
  })
}, { passive: true })
