import { expect, test } from '@playwright/test'

test('forwards content through nested component slots', async ({ page }) => {
  await page.goto('/tests/fixtures/slots.html')

  await expect(page.getByRole('button', { name: 'Nested action' })).toBeVisible()
})
