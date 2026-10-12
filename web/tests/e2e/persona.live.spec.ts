import { expect, test } from "@playwright/test";

test("public preview loads only each persona's authorized documents", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  const personas = [
    { name: "Alex", department: "finance" },
    { name: "Sam", department: "operations" },
    { name: "Priya", department: "people" },
  ] as const;
  for (const persona of personas) {
    const documentsLoaded = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === new URL(page.url()).origin &&
        url.pathname === "/api/documents"
      );
    });
    await page
      .getByRole("button", {
        name: new RegExp(`another account: ${persona.name},`),
      })
      .click();
    expect((await documentsLoaded).status()).toBe(200);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("textbox")).toBeEnabled();
    for (const folder of personas) {
      const button = page.locator(
        `.folder-group.${folder.department} .folder-button`,
      );
      if (folder.department === persona.department) {
        await expect(button).toBeEnabled();
        await expect(button).toHaveAttribute("aria-expanded", "true");
        await expect(
          page.locator(`#files-${folder.department} button`),
        ).toHaveCount(2);
        await expect(page.locator(`#files-${folder.department}`)).toBeVisible();
      } else {
        await expect(button).toBeDisabled();
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await expect(
          page.locator(`#files-${folder.department} button`),
        ).toHaveCount(0);
      }
    }
    await expect(page.locator(".files button:visible")).toHaveCount(2);
  }
});
