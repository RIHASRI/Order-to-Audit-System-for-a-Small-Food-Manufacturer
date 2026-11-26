import { test, expect } from '@playwright/test';

test.describe('FactoryFlow ERP Browser E2E', () => {
  test('logs in as Owner and verifies dashboard, inventory, production, orders, invoices, costing, and reports with zero runtime errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/login');
    await expect(page.getByText('FactoryFlow ERP', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page.getByText('Business Owner Dashboard', { exact: true }).first()).toBeVisible({ timeout: 15000 });

    // Check Master Data — use table cell or first match to avoid strict-mode violation
    await page.getByRole('link', { name: 'Master Data' }).click();
    await page.waitForURL('**/master-data', { timeout: 10000 });
    await expect(page.getByText('Murukku 200 g').first()).toBeVisible({ timeout: 10000 });

    // Check BOM
    await page.getByRole('link', { name: 'Bill of Materials' }).click();
    await page.waitForURL('**/bom', { timeout: 10000 });
    await expect(page.getByText('BOM-FG-MRK-200-V1').first()).toBeVisible({ timeout: 10000 });

    // Check Production Run variance alert (-6%)
    await page.getByRole('link', { name: 'Production Runs' }).click();
    await page.waitForURL('**/production', { timeout: 10000 });
    await expect(page.getByText('PROD-2026-0001').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('-6%').first()).toBeVisible({ timeout: 10000 });

    // Check Inventory closing stocks from benchmark
    await page.getByRole('link', { name: 'Inventory & Ledger' }).click();
    await page.waitForURL('**/inventory', { timeout: 10000 });
    await expect(page.getByText('Rice & Besan Flour').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('120 kg').first()).toBeVisible({ timeout: 10000 });

    // Check Purchases
    await page.getByRole('link', { name: 'Purchases' }).click();
    await page.waitForURL('**/purchases', { timeout: 10000 });
    await expect(page.getByText('Cauvery Agro Mills').first()).toBeVisible({ timeout: 10000 });

    // Check Sales Orders (Retailer A + Distributor B shortage 32)
    await page.getByRole('link', { name: 'Sales Orders' }).click();
    await page.waitForURL('**/orders', { timeout: 10000 });
    await expect(page.getByText('Distributor B').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Short: 32/).first()).toBeVisible({ timeout: 10000 });

    // Check GST Invoice & Outstanding
    await page.getByRole('link', { name: 'GST Invoicing' }).click();
    await page.waitForURL('**/invoices', { timeout: 10000 });
    await expect(page.getByText('Retailer A').first()).toBeVisible({ timeout: 10000 });

    // Check Dispatches
    await page.getByRole('link', { name: 'Dispatches' }).click();
    await page.waitForURL('**/dispatches', { timeout: 10000 });
    await expect(page.getByText('DISP-2026-0001').first()).toBeVisible({ timeout: 10000 });

    // Check Payments & Ageing
    await page.getByRole('link', { name: 'Payments & Ageing' }).click();
    await page.waitForURL('**/payments', { timeout: 10000 });
    await expect(page.getByText('Customer Receivables & Ageing').first()).toBeVisible({ timeout: 10000 });

    // Check Costing Analysis
    await page.getByRole('link', { name: 'Costing Analysis' }).click();
    await page.waitForURL('**/costing', { timeout: 10000 });
    await expect(page.getByText('Production Costing & Margin Analysis').first()).toBeVisible({ timeout: 10000 });

    // Check Reports & Audit — look for visible page heading, not the hidden <option>
    await page.getByRole('link', { name: 'Reports & Audit' }).click();
    await page.waitForURL('**/reports', { timeout: 10000 });
    await expect(page.getByText('Reports & Immutable Audit Trail').first()).toBeVisible({ timeout: 10000 });

    expect(errors).toEqual([]);
  });
});
