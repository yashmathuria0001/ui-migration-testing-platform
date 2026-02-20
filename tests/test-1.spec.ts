import { test, expect } from "@playwright/test";

test("test", async ({ page }) => {
  await page.goto("http://localhost:3001/");
  await expect(page.getByText("Account LoginAccess your home")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await page.getByRole("textbox", { name: "Username" }).click();
  await page.getByRole("textbox", { name: "Username" }).fill("ANI");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("1234");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(
    page.getByText(
      "Welcome back, ANI!Here's an overview of your home loan accountLogout",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Make a Payment" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View Statements" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Contact Support" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Make a Payment" }).click();
  await page.locator('input[type="date"]').fill("2026-03-03");
  await page.getByRole("button", { name: "Submit Payment" }).click();
  await page.getByText("!Payment date is after the").click();
  await expect(page.locator("form")).toContainText("Submit Payment");
  await page.getByRole("button", { name: "View Statements" }).click();
  await expect(page.locator("#root")).toContainText("Principal Paid");
  await expect(page.locator("#root")).toContainText("Interest Paid");
  await page.getByRole("button", { name: "Contact Support" }).click();
  await expect(page.getByRole("button", { name: "Start Chat" })).toBeVisible();
  await page.getByRole("button", { name: "Send Message" }).click();
  await page.getByText("Please fill in all required").click();
  await page.getByRole("textbox", { name: "your.email@example.com" }).click();
  await page
    .getByRole("textbox", { name: "your.email@example.com" })
    .fill("afaa");
  await page.getByRole("textbox", { name: "(555) 123-" }).click();
  await page.getByRole("textbox", { name: "(555) 123-" }).fill("sdaa");
  await page
    .getByRole("textbox", { name: "Please describe your inquiry" })
    .click();
  await page
    .getByRole("textbox", { name: "Please describe your inquiry" })
    .fill("sda");
  await page.getByRole("button", { name: "Send Message" }).click();
  await page.getByText("✓Message sent successfully!").click();
  await page.getByRole("button", { name: "Logout" }).click();
});
