import { expect, test } from '@playwright/test'

test('mounted routes render an existing view and navigate without remounting it', async ({ page }) => {
  await page.goto('/tests/fixtures/router.html')
  await page.waitForFunction(() => window.routerFixture)

  const initial = await page.evaluate(() => ({
    path: window.routerFixture.states.route.path,
    model: window.routerFixture.states.route.params.model,
    creates: window.routerFixture.creates(),
  }))
  expect(initial).toEqual({ path: '/resources/models/paper-observatory', model: 'paper-observatory', creates: 1 })

  const result = await page.evaluate(async () => {
    await window.routerFixture.navigate('/resources/models/second-model')
    const nested = { path: location.pathname, model: window.routerFixture.states.route.params.model }
    await window.routerFixture.navigate('/resources/models')
    return { nested, path: location.pathname, creates: window.routerFixture.creates() }
  })

  expect(result).toEqual({
    nested: { path: '/resources/models/second-model', model: 'second-model' },
    path: '/resources/models',
    creates: 1,
  })
})

test('dismissing an in-page mounted route returns through browser history', async ({ page }) => {
  await page.goto('/tests/fixtures/router.html')
  await page.waitForFunction(() => window.routerFixture)
  await page.evaluate(() => window.routerFixture.navigate('/resources/models'))
  await page.evaluate(() => window.routerFixture.navigate('/resources/models/from-gallery'))
  await page.evaluate(() => window.routerFixture.dismissRoute('/resources/models'))

  await expect.poll(() => page.evaluate(() => location.pathname)).toBe('/resources/models')
  expect(await page.evaluate(() => window.routerFixture.creates())).toBe(1)
})
