import { expect, test } from '@playwright/test'
import core from '../newtree/plugin.js'

function hotContext() {
  const messages = []
  let invalidations = 0
  return {
    context: {
      environment: {
        name: 'client',
        hot: { send: message => messages.push(message) },
        moduleGraph: { invalidateAll: () => invalidations++ }
      }
    },
    messages,
    invalidations: () => invalidations
  }
}

test('reloads after a missing CSS import is created', () => {
  const plugin = core()
  const hot = hotContext()

  const result = plugin.hotUpdate.call(hot.context, {
    type: 'create',
    file: '/project/src/styles/analytics.css'
  })

  expect(result).toEqual([])
  expect(hot.invalidations()).toBe(1)
  expect(hot.messages).toEqual([{ type: 'full-reload', path: '*' }])
})

test('leaves ordinary CSS updates to Vite HMR', () => {
  const plugin = core()
  const hot = hotContext()

  const result = plugin.hotUpdate.call(hot.context, {
    type: 'update',
    file: '/project/src/styles/analytics.css'
  })

  expect(result).toBeUndefined()
  expect(hot.invalidations()).toBe(0)
  expect(hot.messages).toEqual([])
})

test('reloads when a Newtree source file is created', () => {
  const plugin = core()
  const hot = hotContext()

  const result = plugin.hotUpdate.call(hot.context, {
    type: 'create',
    file: '/project/src/views/analytics.view'
  })

  expect(result).toEqual([])
  expect(hot.messages).toEqual([{ type: 'full-reload', path: '*' }])
})
