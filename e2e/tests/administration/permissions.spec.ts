import { faker } from '@faker-js/faker';
import { expect, test } from '@playwright/test';
import {
  createUser,
  enterAdminArea,
  enterUserArea,
  hasMenuItem,
  login,
  logout,
  navigateToUserAdministration,
} from '../utils/helper';

test.describe('User permissions', () => {
  const randomName = faker.person.fullName();
  const randomEmail = faker.internet.email();
  const randomPassword = faker.internet.password({ length: 12 });

  test.beforeEach(async ({ page }) => {
    await login(page);
    await enterAdminArea(page);
  });

  test('admin user should see admin item in chat section', async ({ page }) => {
    await enterUserArea(page);
    expect(await hasMenuItem(page, { name: 'Admin' })).toBe(true);
  });

  test('admin user should not see admin item in admin section', async ({ page }) => {
    expect(await hasMenuItem(page, { name: 'Admin' })).toBe(false);
  });

  test('should show admin documentation on chat page for admin users', async ({ page }) => {
    await enterUserArea(page);
    await page.waitForTimeout(2000); // such that docs have some time to load
    await page.getByTestId('docs-icon').click();
    await page.getByRole('heading', { name: 'Documentation' }).click();
    await page.getByRole('heading', { name: 'How to setup an Assistent' }).click();
  });

  test('newly created user with group default', async ({ page }) => {
    await navigateToUserAdministration(page);
    await createUser(page, { email: randomEmail, name: randomName, password: randomPassword });
    await logout(page);

    await test.step('should not see admin section', async () => {
      await login(page, { email: randomEmail, password: randomPassword });
      expect(await hasMenuItem(page, { name: 'Admin' })).toBe(false);
    });

    await test.step('non adimn user should not see documentation on the chat page', async () => {
      await page.waitForTimeout(2000); // such that docs have some time to load
      await expect(page.getByTestId('docs-icon')).toBeHidden();
    });
  });
});
