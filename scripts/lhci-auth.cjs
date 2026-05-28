module.exports = async (browser, context) => {
  const page = await browser.newPage();
  await page.goto(context.url, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    localStorage.setItem(
      "boqai.session",
      JSON.stringify({
        username: "demo",
        expires_at: Date.now() + 1000 * 60 * 60,
      })
    );
  });
  await page.close();
};
