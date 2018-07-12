const path = require('path')
const assert = require('assert')
const webdriver = require('selenium-webdriver')
const { By, Key, until } = webdriver
const {
  delay,
  buildChromeWebDriver,
  buildFirefoxWebdriver,
  installWebExt,
  getExtensionIdChrome,
  getExtensionIdFirefox,
} = require('../func')
const {
  assertElementNotPresent,
  checkBrowserForConsoleErrors,
  closeAllWindowHandlesExcept,
  findElement,
  findElements,
  loadExtension,
  openNewPage,
  switchToWindowWithTitle,
  verboseReportOnFailure,
  waitUntilXWindowHandles,
} = require('./helpers')

describe('MetaMask', function () {
  let extensionId
  let driver
  let tokenAddress

  const testSeedPhrase = 'phrase upgrade clock rough situate wedding elder clever doctor stamp excess tent'
  const tinyDelayMs = 200
  const regularDelayMs = tinyDelayMs * 2
  const largeDelayMs = regularDelayMs * 2

  this.timeout(0)
  this.bail(true)

  before(async function () {
    switch (process.env.SELENIUM_BROWSER) {
      case 'chrome': {
        const extPath = path.resolve('dist/chrome')
        driver = buildChromeWebDriver(extPath)
        extensionId = await getExtensionIdChrome(driver)
        await driver.get(`chrome-extension://${extensionId}/popup.html`)
        break
      }
      case 'firefox': {
        const extPath = path.resolve('dist/firefox')
        driver = buildFirefoxWebdriver()
        await installWebExt(driver, extPath)
        await delay(700)
        extensionId = await getExtensionIdFirefox(driver)
        await driver.get(`moz-extension://${extensionId}/popup.html`)
      }
    }
  })

  afterEach(async function () {
    if (process.env.SELENIUM_BROWSER === 'chrome') {
      const errors = await checkBrowserForConsoleErrors(driver)
      if (errors.length) {
        const errorReports = errors.map(err => err.message)
        const errorMessage = `Errors found in browser console:\n${errorReports.join('\n')}`
        console.error(new Error(errorMessage))
      }
    }
    if (this.currentTest.state === 'failed') {
      await verboseReportOnFailure(driver, this.currentTest)
    }
  })

  after(async function () {
    await driver.quit()
  })

  describe('New UI setup', async function () {
    let networkSelector
    it('switches to first tab', async function () {
      const [firstTab] = await driver.getAllWindowHandles()
      await driver.switchTo().window(firstTab)
      await delay(regularDelayMs)
      try {
        networkSelector = await findElement(driver, By.css('#network_component'))
      } catch (e) {
        await loadExtension(driver, extensionId)
        await delay(largeDelayMs * 2)
        networkSelector = await findElement(driver, By.css('#network_component'))
      }
      await delay(regularDelayMs)
    })

    it('uses the local network', async function () {
      await networkSelector.click()
      await delay(regularDelayMs)

      const networks = await findElements(driver, By.css('.dropdown-menu-item'))
      const localhost = networks[4]
      await driver.wait(until.elementTextMatches(localhost, /Localhost/))
      await localhost.click()
      await delay(regularDelayMs)
    })

    it('selects the new UI option', async () => {
      try {
        const overlay = await findElement(driver, By.css('.full-flex-height'))
        await driver.wait(until.stalenessOf(overlay))
      } catch (e) {}

      const button = await findElement(driver, By.xpath("//p[contains(text(), 'Try Beta Version')]"))
      await button.click()
      await delay(regularDelayMs)

      // Close all other tabs
      const [oldUi, tab1, tab2] = await driver.getAllWindowHandles()
      await driver.switchTo().window(oldUi)
      await driver.close()

      await driver.switchTo().window(tab1)
      const tab1Url = await driver.getCurrentUrl()
      if (tab1Url.match(/metamask.io/)) {
        await driver.switchTo().window(tab1)
        await driver.close()
        await driver.switchTo().window(tab2)
      } else if (tab2) {
        await driver.switchTo().window(tab2)
        await driver.close()
        await driver.switchTo().window(tab1)
      }
      await delay(regularDelayMs)

      const continueBtn = await findElement(driver, By.css('.welcome-screen__button'))
      await continueBtn.click()
      await delay(regularDelayMs)
    })
  })

  describe('Going through the first time flow', () => {
    it('accepts a secure password', async () => {
      const passwordBox = await findElement(driver, By.css('.create-password #create-password'))
      const passwordBoxConfirm = await findElement(driver, By.css('.create-password #confirm-password'))
      const button = await findElement(driver, By.css('.create-password button'))

      await passwordBox.sendKeys('correct horse battery staple')
      await passwordBoxConfirm.sendKeys('correct horse battery staple')
      await button.click()
      await delay(regularDelayMs)
    })

    it('clicks through the unique image screen', async () => {
      const nextScreen = await findElement(driver, By.css('.unique-image button'))
      await nextScreen.click()
      await delay(regularDelayMs)
    })

    it('clicks through the ToS', async () => {
      // terms of use
      const canClickThrough = await driver.findElement(By.css('.tou button')).isEnabled()
      assert.equal(canClickThrough, false, 'disabled continue button')
      const bottomOfTos = await findElement(driver, By.linkText('Attributions'))
      await driver.executeScript('arguments[0].scrollIntoView(true)', bottomOfTos)
      await delay(regularDelayMs)
      const acceptTos = await findElement(driver, By.css('.tou button'))
      driver.wait(until.elementIsEnabled(acceptTos))
      await acceptTos.click()
      await delay(regularDelayMs)
    })

    it('clicks through the privacy notice', async () => {
      // privacy notice
      const nextScreen = await findElement(driver, By.css('.tou button'))
      await nextScreen.click()
      await delay(regularDelayMs)
    })

    it('clicks through the phishing notice', async () => {
      // phishing notice
      const noticeElement = await driver.findElement(By.css('.markdown'))
      await driver.executeScript('arguments[0].scrollTop = arguments[0].scrollHeight', noticeElement)
      await delay(regularDelayMs)
      const nextScreen = await findElement(driver, By.css('.tou button'))
      await nextScreen.click()
      await delay(regularDelayMs)
    })

    let seedPhrase

    it('reveals the seed phrase', async () => {
      const byRevealButton = By.css('.backup-phrase__secret-blocker .backup-phrase__reveal-button')
      await driver.wait(until.elementLocated(byRevealButton, 10000))
      const revealSeedPhraseButton = await findElement(driver, byRevealButton, 10000)
      await revealSeedPhraseButton.click()
      await delay(regularDelayMs)

      seedPhrase = await driver.findElement(By.css('.backup-phrase__secret-words')).getText()
      assert.equal(seedPhrase.split(' ').length, 12)
      await delay(regularDelayMs)

      const nextScreen = await findElement(driver, By.css('.backup-phrase button'))
      await nextScreen.click()
      await delay(regularDelayMs)
    })

    async function retypeSeedPhrase (words, wasReloaded) {
      try {
        if (wasReloaded) {
          const byRevealButton = By.css('.backup-phrase__secret-blocker .backup-phrase__reveal-button')
          await driver.wait(until.elementLocated(byRevealButton, 10000))
          const revealSeedPhraseButton = await findElement(driver, byRevealButton, 10000)
          await revealSeedPhraseButton.click()
          await delay(regularDelayMs)

          const nextScreen = await findElement(driver, By.css('.backup-phrase button'))
          await nextScreen.click()
          await delay(regularDelayMs)
        }

        const word0 = await findElement(driver, By.xpath(`//button[contains(text(), '${words[0]}')]`), 10000)

        await word0.click()
        await delay(tinyDelayMs)

        const word1 = await findElement(driver, By.xpath(`//button[contains(text(), '${words[1]}')]`), 10000)

        await word1.click()
        await delay(tinyDelayMs)

        const word2 = await findElement(driver, By.xpath(`//button[contains(text(), '${words[2]}')]`), 10000)

        await word2.click()
        await delay(tinyDelayMs)

        const word3 = await findElement(driver, By.xpath(`//button[contains(text(), '${words[3]}')]`), 10000)

        await word3.click()
        await delay(tinyDelayMs)

        const word4 = await findElement(driver, By.xpath(`//button[contains(text(), '${words[4]}')]`), 10000)

        await word4.click()
        await delay(tinyDelayMs)

        const word5 = await findElement(driver, By.xpath(`//button[contains(text(), '${words[5]}')]`), 10000)

        await word5.click()
        await delay(tinyDelayMs)

        const word6 = await findElement(driver, By.xpath(`//button[contains(text(), '${words[6]}')]`), 10000)

        await word6.click()
        await delay(tinyDelayMs)

        const word7 = await findElement(driver, By.xpath(`//button[contains(text(), '${words[7]}')]`), 10000)

        await word7.click()
        await delay(tinyDelayMs)

        const word8 = await findElement(driver, By.xpath(`//button[contains(text(), '${words[8]}')]`), 10000)

        await word8.click()
        await delay(tinyDelayMs)

        const word9 = await findElement(driver, By.xpath(`//button[contains(text(), '${words[9]}')]`), 10000)

        await word9.click()
        await delay(tinyDelayMs)

        const word10 = await findElement(driver, By.xpath(`//button[contains(text(), '${words[10]}')]`), 10000)

        await word10.click()
        await delay(tinyDelayMs)

        const word11 = await findElement(driver, By.xpath(`//button[contains(text(), '${words[11]}')]`), 10000)
        await word11.click()
        await delay(tinyDelayMs)
      } catch (e) {
        await loadExtension(driver, extensionId)
        await retypeSeedPhrase(words, true)
      }
    }

    it('can retype the seed phrase', async () => {
      const words = seedPhrase.split(' ')

      await retypeSeedPhrase(words)

      const confirm = await findElement(driver, By.xpath(`//button[contains(text(), 'Confirm')]`))
      await confirm.click()
      await delay(regularDelayMs)
    })

    it('clicks through the deposit modal', async () => {
      const byBuyModal = By.css('span .modal')
      const buyModal = await driver.wait(until.elementLocated(byBuyModal))
      const closeModal = await findElement(driver, By.css('.page-container__header-close'))
      await closeModal.click()
      await driver.wait(until.stalenessOf(buyModal))
      await delay(regularDelayMs)
    })
  })

  describe('Show account information', () => {
    it('shows the QR code for the account', async () => {
      await driver.findElement(By.css('.wallet-view__details-button')).click()
      await driver.findElement(By.css('.qr-wrapper')).isDisplayed()
      await delay(regularDelayMs)

      const accountModal = await driver.findElement(By.css('span .modal'))

      await driver.executeScript("document.querySelector('.account-modal-close').click()")

      await driver.wait(until.stalenessOf(accountModal))
      await delay(regularDelayMs)
    })
  })

  describe('Log out an log back in', () => {
    it('logs out of the account', async () => {
      await driver.findElement(By.css('.account-menu__icon')).click()
      await delay(regularDelayMs)

      const logoutButton = await findElement(driver, By.css('.account-menu__logout-button'))
      assert.equal(await logoutButton.getText(), 'Log out')
      await logoutButton.click()
      await delay(regularDelayMs)
    })

    it('accepts the account password after lock', async () => {
      await driver.findElement(By.id('password')).sendKeys('correct horse battery staple')
      await driver.findElement(By.id('password')).sendKeys(Key.ENTER)
      await delay(largeDelayMs * 4)
    })
  })

  describe('Add account', () => {
    it('choose Create Account from the account menu', async () => {
      await driver.findElement(By.css('.account-menu__icon')).click()
      await delay(regularDelayMs)

      const createAccount = await findElement(driver, By.xpath(`//div[contains(text(), 'Create Account')]`))
      await createAccount.click()
      await delay(regularDelayMs)
    })

    it('set account name', async () => {
      const accountName = await findElement(driver, By.css('.new-account-create-form input'))
      await accountName.sendKeys('2nd account')
      await delay(regularDelayMs)

      const create = await findElement(driver, By.xpath(`//button[contains(text(), 'Create')]`))
      await create.click()
      await delay(largeDelayMs)
    })

    it('should display correct account name', async () => {
      const accountName = await findElement(driver, By.css('.account-name'))
      assert.equal(await accountName.getText(), '2nd account')
      await delay(regularDelayMs)
    })
  })

  describe('Import seed phrase', () => {
    it('logs out of the vault', async () => {
      await driver.findElement(By.css('.account-menu__icon')).click()
      await delay(regularDelayMs)

      const logoutButton = await findElement(driver, By.css('.account-menu__logout-button'))
      assert.equal(await logoutButton.getText(), 'Log out')
      await logoutButton.click()
      await delay(regularDelayMs)
    })

    it('imports seed phrase', async () => {
      const restoreSeedLink = await findElement(driver, By.css('.unlock-page__link--import'))
      assert.equal(await restoreSeedLink.getText(), 'Import using account seed phrase')
      await restoreSeedLink.click()
      await delay(regularDelayMs)

      const seedTextArea = await findElement(driver, By.css('textarea'))
      await seedTextArea.sendKeys(testSeedPhrase)
      await delay(regularDelayMs)

      const passwordInputs = await driver.findElements(By.css('input'))
      await delay(regularDelayMs)

      passwordInputs[0].sendKeys('correct horse battery staple')
      passwordInputs[1].sendKeys('correct horse battery staple')
      await driver.findElement(By.css('.first-time-flow__button')).click()
      await delay(regularDelayMs)
    })

    it('balance renders', async () => {
      const balance = await findElement(driver, By.css('.balance-display .token-amount'))
      await driver.wait(until.elementTextMatches(balance, /100.+ETH/))
      await delay(regularDelayMs)
    })
  })

  describe('Send ETH from inside MetaMask', () => {
    it('starts to send a transaction', async function () {
      const sendButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Send')]`))
      await sendButton.click()
      await delay(regularDelayMs)

      const inputAddress = await findElement(driver, By.css('input[placeholder="Recipient Address"]'))
      const inputAmount = await findElement(driver, By.css('.currency-display__input'))
      await inputAddress.sendKeys('0x2f318C334780961FB129D2a6c30D0763d9a5C970')
      await inputAmount.sendKeys('1')

      const inputValue = await inputAmount.getAttribute('value')
      assert.equal(inputValue, '1')

      // Set the gas limit
      const configureGas = await findElement(driver, By.css('.send-v2__gas-fee-display button'))
      await configureGas.click()
      await delay(regularDelayMs)

      const gasModal = await driver.findElement(By.css('span .modal'))

      const save = await findElement(driver, By.xpath(`//button[contains(text(), 'Save')]`))
      await save.click()
      await driver.wait(until.stalenessOf(gasModal))
      await delay(regularDelayMs)

      // Continue to next screen
      const nextScreen = await findElement(driver, By.xpath(`//button[contains(text(), 'Next')]`))
      await nextScreen.click()
      await delay(regularDelayMs)
    })

    it('confirms the transaction', async function () {
      const confirmButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Confirm')]`))
      await confirmButton.click()
      await delay(largeDelayMs)
    })

    it('finds the transaction in the transactions list', async function () {
      const transactions = await findElements(driver, By.css('.tx-list-item'))
      assert.equal(transactions.length, 1)

      if (process.env.SELENIUM_BROWSER !== 'firefox') {
        const txValues = await findElement(driver, By.css('.tx-list-value'))
        await driver.wait(until.elementTextMatches(txValues, /1\sETH/), 10000)
      }
    })
  })

  describe('Send ETH from dapp', () => {
    let windowHandles
    let extension
    let popup
    let dapp
    it('opens the dapp and approves web3 access', async () => {
      await openNewPage(driver, 'http://127.0.0.1:8080/')
      await delay(regularDelayMs)

      await waitUntilXWindowHandles(driver, 3)
      windowHandles = await driver.getAllWindowHandles()

      extension = windowHandles[0]
      popup = await switchToWindowWithTitle(driver, 'MetaMask Notification', windowHandles)
      dapp = windowHandles.find(handle => handle !== extension && handle !== popup)

      await delay(regularDelayMs)
      const approveButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Approve')]`), 10000)
      approveButton.click()
    })

    it('initiates a send from the dapp', async () => {
      await driver.switchTo().window(dapp)
      await delay(regularDelayMs)

      const send3eth = await findElement(driver, By.xpath(`//button[contains(text(), 'Send')]`), 10000)
      await send3eth.click()
      await delay(regularDelayMs)

      await waitUntilXWindowHandles(driver, 3)
      windowHandles = await driver.getAllWindowHandles()

      await driver.switchTo().window(windowHandles[2])
      await delay(regularDelayMs)
    })

    it('confirms the send eth transaction', async () => {
      assertElementNotPresent(webdriver, driver, By.xpath(`//li[contains(text(), 'Data')]`))

      const confirmButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Confirm')]`), 10000)
      await confirmButton.click()
      await delay(regularDelayMs)

      await closeAllWindowHandlesExcept(driver, [extension, dapp])
      await driver.switchTo().window(extension)
      await delay(regularDelayMs)
    })

    it('finds the transaction in the transactions list', async function () {
      const transactions = await findElements(driver, By.css('.tx-list-item'))
      assert.equal(transactions.length, 2)

      const txValues = await findElement(driver, By.css('.tx-list-value'))
      await driver.wait(until.elementTextMatches(txValues, /3\sETH/), 10000)
    })
  })

  describe('Deploy contract and call contract methods', () => {
    let extension
    let dapp
    it('creates a deploy contract transaction', async () => {
      const windowHandles = await driver.getAllWindowHandles()
      extension = windowHandles[0]
      dapp = windowHandles[1]
      await delay(tinyDelayMs)

      await driver.switchTo().window(dapp)
      await delay(regularDelayMs)

      const deployContractButton = await findElement(driver, By.css('#deployButton'))
      await deployContractButton.click()
      await delay(regularDelayMs)

      await driver.switchTo().window(extension)
      await delay(regularDelayMs)

      const txListItem = await findElement(driver, By.xpath(`//span[contains(text(), 'Contract Deployment')]`))
      await txListItem.click()
      await delay(regularDelayMs)
    })

    it('displays the contract creation data', async () => {
      const dataTab = await findElement(driver, By.xpath(`//li[contains(text(), 'Data')]`))
      dataTab.click()
      await (regularDelayMs)

      await findElement(driver, By.xpath(`//div[contains(text(), '127.0.0.1')]`))

      const confirmDataDiv = await findElement(driver, By.css('.confirm-page-container-content__data-box'))
      const confirmDataText = await confirmDataDiv.getText()
      assert.equal(confirmDataText.match(/0x608060405234801561001057600080fd5b5033600160006101000a81548173ffffffffffffffffffffffffffffffffffffffff/))

      const detailsTab = await findElement(driver, By.xpath(`//li[contains(text(), 'Details')]`))
      detailsTab.click()
      await (regularDelayMs)
    })

    it('confirms a deploy contract transaction', async () => {
      const confirmButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Confirm')]`))
      await confirmButton.click()
      await delay(regularDelayMs)

      const txStatuses = await findElements(driver, By.css('.tx-list-status'))
      await driver.wait(until.elementTextMatches(txStatuses[0], /Confirmed/))

      const txAccounts = await findElements(driver, By.css('.tx-list-account'))
      assert.equal(await txAccounts[0].getText(), 'Contract Deployment')
      await delay(regularDelayMs)
    })

    it('calls and confirms a contract method where ETH is sent', async () => {
      await driver.switchTo().window(dapp)
      await delay(regularDelayMs)

      const depositButton = await findElement(driver, By.css('#depositButton'))
      await depositButton.click()
      await delay(regularDelayMs)

      await driver.switchTo().window(extension)
      await delay(regularDelayMs)

      await findElements(driver, By.css('.tx-list-pending-item-container'))
      const [txListValue] = await findElements(driver, By.css('.tx-list-value'))
      await driver.wait(until.elementTextMatches(txListValue, /4\sETH/), 10000)
      await txListValue.click()
      await delay(regularDelayMs)

      // Set the gas limit
      const configureGas = await findElement(driver, By.css('.confirm-detail-row__header-text--edit'))
      await configureGas.click()
      await delay(regularDelayMs)

      const gasModal = await driver.findElement(By.css('span .modal'))
      await driver.wait(until.elementLocated(By.css('.customize-gas__title')))

      const [gasPriceInput, gasLimitInput] = await findElements(driver, By.css('.customize-gas-input'))
      await gasPriceInput.clear()
      await gasPriceInput.sendKeys('10')
      await gasLimitInput.clear()
      await gasLimitInput.sendKeys('60001')

      const save = await findElement(driver, By.xpath(`//button[contains(text(), 'Save')]`))
      await save.click()
      await delay(regularDelayMs)

      await driver.wait(until.stalenessOf(gasModal))

      const confirmButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Confirm')]`))
      await confirmButton.click()
      await delay(regularDelayMs)

      const txStatuses = await findElements(driver, By.css('.tx-list-status'))
      await driver.wait(until.elementTextMatches(txStatuses[0], /Confirmed/))

      const txValues = await findElement(driver, By.css('.tx-list-value'))
      await driver.wait(until.elementTextMatches(txValues, /4\sETH/), 10000)

      const txAccounts = await findElements(driver, By.css('.tx-list-account'))
      const firstTxAddress = await txAccounts[0].getText()
      assert(firstTxAddress.match(/^0x\w{8}\.{3}\w{4}$/))
    })

    it('calls and confirms a contract method where ETH is received', async () => {
      await driver.switchTo().window(dapp)
      await delay(regularDelayMs)

      const withdrawButton = await findElement(driver, By.css('#withdrawButton'))
      await withdrawButton.click()
      await delay(regularDelayMs)

      await driver.switchTo().window(extension)
      await delay(regularDelayMs)

      const txListItem = await findElement(driver, By.css('.tx-list-item'))
      await txListItem.click()
      await delay(regularDelayMs)

      const confirmButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Confirm')]`))
      await confirmButton.click()
      await delay(regularDelayMs)

      const txStatuses = await findElements(driver, By.css('.tx-list-status'))
      await driver.wait(until.elementTextMatches(txStatuses[0], /Confirmed/))

      const txValues = await findElement(driver, By.css('.tx-list-value'))
      await driver.wait(until.elementTextMatches(txValues, /0\sETH/), 10000)

      await closeAllWindowHandlesExcept(driver, [extension, dapp])
      await driver.switchTo().window(extension)
    })

    it('renders the correct ETH balance', async () => {
      const balance = await findElement(driver, By.css('.tx-view .balance-display .token-amount'))
      await delay(regularDelayMs)
      if (process.env.SELENIUM_BROWSER !== 'firefox') {
        await driver.wait(until.elementTextMatches(balance, /^92.*ETH.*$/), 10000)
        const tokenAmount = await balance.getText()
        assert.ok(/^92.*ETH.*$/.test(tokenAmount))
        await delay(regularDelayMs)
      }
    })
  })

  describe('Add a custom token from a dapp', () => {
    it('creates a new token', async () => {
      const windowHandles = await driver.getAllWindowHandles()
      const extension = windowHandles[0]
      const dapp = windowHandles[1]
      await delay(regularDelayMs * 2)

      await driver.switchTo().window(dapp)
      await delay(regularDelayMs)

      const createToken = await findElement(driver, By.xpath(`//button[contains(text(), 'Create Token')]`))
      await createToken.click()
      await delay(regularDelayMs)

      await driver.switchTo().window(extension)
      await loadExtension(driver, extensionId)
      await delay(regularDelayMs)

      const confirmButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Confirm')]`))
      await confirmButton.click()
      await delay(regularDelayMs)

      await driver.switchTo().window(dapp)
      await delay(tinyDelayMs)

      const tokenContractAddress = await driver.findElement(By.css('#tokenAddress'))
      await driver.wait(until.elementTextMatches(tokenContractAddress, /0x/))
      tokenAddress = await tokenContractAddress.getText()

      await delay(regularDelayMs)
      await closeAllWindowHandlesExcept(driver, [extension, dapp])
      await delay(regularDelayMs)
      await driver.switchTo().window(extension)
      await delay(regularDelayMs)

    })

    it('clicks on the Add Token button', async () => {
      const addToken = await findElement(driver, By.xpath(`//button[contains(text(), 'Add Token')]`))
      await addToken.click()
      await delay(regularDelayMs)
    })

    it('picks the newly created Test token', async () => {
      const addCustomToken = await findElement(driver, By.xpath("//div[contains(text(), 'Custom Token')]"))
      await addCustomToken.click()
      await delay(regularDelayMs)

      const newTokenAddress = await findElement(driver, By.css('#custom-address'))
      await newTokenAddress.sendKeys(tokenAddress)
      await delay(regularDelayMs)

      const nextScreen = await findElement(driver, By.xpath(`//button[contains(text(), 'Next')]`))
      await nextScreen.click()
      await delay(regularDelayMs)

      const addTokens = await findElement(driver, By.xpath(`//button[contains(text(), 'Add Tokens')]`))
      await addTokens.click()
      await delay(regularDelayMs)
    })

    it('renders the balance for the new token', async () => {
      const balance = await findElement(driver, By.css('.tx-view .balance-display .token-amount'))
      await driver.wait(until.elementTextMatches(balance, /^100\s*TST\s*$/))
      const tokenAmount = await balance.getText()
      assert.ok(/^100\s*TST\s*$/.test(tokenAmount))
      await delay(regularDelayMs)
    })
  })

  describe('Send token from inside MetaMask', () => {
    let gasModal
    it('starts to send a transaction', async function () {
      const sendButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Send')]`))
      await sendButton.click()
      await delay(regularDelayMs)

      const inputAddress = await findElement(driver, By.css('input[placeholder="Recipient Address"]'))
      const inputAmount = await findElement(driver, By.css('.currency-display__input'))
      await inputAddress.sendKeys('0x2f318C334780961FB129D2a6c30D0763d9a5C970')
      await inputAmount.sendKeys('50')

      // Set the gas limit
      const configureGas = await findElement(driver, By.css('.send-v2__gas-fee-display button'))
      await configureGas.click()
      await delay(regularDelayMs)

      gasModal = await driver.findElement(By.css('span .modal'))
    })

    it('opens customizes gas modal', async () => {
      await driver.wait(until.elementLocated(By.css('.send-v2__customize-gas__title')))
      const save = await findElement(driver, By.xpath(`//button[contains(text(), 'Save')]`))
      await save.click()
      await delay(regularDelayMs)
    })

    it('transitions to the confirm screen', async () => {
      await driver.wait(until.stalenessOf(gasModal))

      // Continue to next screen
      const nextScreen = await findElement(driver, By.xpath(`//button[contains(text(), 'Next')]`))
      await nextScreen.click()
      await delay(regularDelayMs)
    })

    it('displays the token transfer data', async () => {
      const dataTab = await findElement(driver, By.xpath(`//li[contains(text(), 'Data')]`))
      dataTab.click()
      await (regularDelayMs)

      const functionType = await findElement(driver, By.css('.confirm-page-container-content__function-type'))
      const functionTypeText = await functionType.getText()
      assert.equal(functionTypeText, 'Transfer')

      const confirmDataDiv = await findElement(driver, By.css('.confirm-page-container-content__data-box'))
      const confirmDataText = await confirmDataDiv.getText()
      assert.equal(confirmDataText.match(/0xa9059cbb0000000000000000000000002f318c334780961fb129d2a6c30d0763d9a5c97/))

      const detailsTab = await findElement(driver, By.xpath(`//li[contains(text(), 'Details')]`))
      detailsTab.click()
      await (regularDelayMs)
    })

    it('submits the transaction', async function () {
      const confirmButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Confirm')]`))
      await confirmButton.click()
      await delay(regularDelayMs)
    })

    it('finds the transaction in the transactions list', async function () {
      const transactions = await findElements(driver, By.css('.tx-list-item'))
      assert.equal(transactions.length, 1)

      const txValues = await findElements(driver, By.css('.tx-list-value'))
      assert.equal(txValues.length, 1)

      // test cancelled on firefox until https://github.com/mozilla/geckodriver/issues/906 is resolved,
      // or possibly until we use latest version of firefox in the tests
      if (process.env.SELENIUM_BROWSER !== 'firefox') {
        await driver.wait(until.elementTextMatches(txValues[0], /50\sTST/), 10000)
      }

      const txStatuses = await findElements(driver, By.css('.tx-list-status'))
      const tx = await driver.wait(until.elementTextMatches(txStatuses[0], /Confirmed|Failed/), 10000)
      assert.equal(await tx.getText(), 'Confirmed')
    })
  })

  describe('Send a custom token from dapp', () => {
    let gasModal
    it('sends an already created token', async () => {
      const windowHandles = await driver.getAllWindowHandles()
      const extension = windowHandles[0]
      const dapp = await switchToWindowWithTitle(driver, 'E2E Test Dapp', windowHandles)
      await closeAllWindowHandlesExcept(driver, [extension, dapp])
      await delay(regularDelayMs)

      await driver.switchTo().window(dapp)
      await delay(tinyDelayMs)

      const transferTokens = await findElement(driver, By.xpath(`//button[contains(text(), 'Transfer Tokens')]`))
      await transferTokens.click()

      await closeAllWindowHandlesExcept(driver, [extension, dapp])
      await driver.switchTo().window(extension)
      await delay(largeDelayMs)

      await findElements(driver, By.css('.tx-list-pending-item-container'))
      const [txListValue] = await findElements(driver, By.css('.tx-list-value'))
      await driver.wait(until.elementTextMatches(txListValue, /7\sTST/), 10000)
      await txListValue.click()
      await delay(regularDelayMs)

      // Set the gas limit
      const configureGas = await driver.wait(until.elementLocated(By.css('.confirm-detail-row__header-text--edit')), 10000)
      await configureGas.click()
      await delay(regularDelayMs)

      gasModal = await driver.findElement(By.css('span .modal'))
    })

    it('customizes gas', async () => {
      await driver.wait(until.elementLocated(By.css('.customize-gas__title')))

      const [gasPriceInput, gasLimitInput] = await findElements(driver, By.css('.customize-gas-input'))
      await gasPriceInput.clear()
      await delay(tinyDelayMs)
      await gasPriceInput.sendKeys('10')
      await delay(tinyDelayMs)
      await gasLimitInput.clear()
      await delay(tinyDelayMs)
      await gasLimitInput.sendKeys(Key.chord(Key.CONTROL, 'a'))
      await gasLimitInput.sendKeys('60000')
      await gasLimitInput.sendKeys(Key.chord(Key.CONTROL, 'e'))

      // Needed for different behaviour of input in different versions of firefox
      const gasLimitInputValue = await gasLimitInput.getAttribute('value')
      if (gasLimitInputValue === '600001') {
        await gasLimitInput.sendKeys(Key.BACK_SPACE)
      }

      const save = await findElement(driver, By.css('.customize-gas__save'))
      await save.click()
      await driver.wait(until.stalenessOf(gasModal))

      const gasFeeInputs = await findElements(driver, By.css('.confirm-detail-row__eth'))
      assert.equal(await gasFeeInputs[0].getText(), '♦ 0.0006')
    })

    it('submits the transaction', async function () {
      const confirmButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Confirm')]`))
      await confirmButton.click()
      await delay(regularDelayMs)
    })

    it('finds the transaction in the transactions list', async function () {
      const transactions = await findElements(driver, By.css('.tx-list-item'))
      assert.equal(transactions.length, 2)

      const txValues = await findElements(driver, By.css('.tx-list-value'))
      await driver.wait(until.elementTextMatches(txValues[0], /7\sTST/))
      const txStatuses = await findElements(driver, By.css('.tx-list-status'))
      await driver.wait(until.elementTextMatches(txStatuses[0], /Confirmed/))

      const walletBalance = await findElement(driver, By.css('.wallet-balance'))
      await walletBalance.click()

      const tokenListItems = await findElements(driver, By.css('.token-list-item'))
      await tokenListItems[0].click()

      // test cancelled on firefox until https://github.com/mozilla/geckodriver/issues/906 is resolved,
      // or possibly until we use latest version of firefox in the tests
      if (process.env.SELENIUM_BROWSER !== 'firefox') {
        const tokenBalanceAmount = await findElement(driver, By.css('.token-balance__amount'))
        assert.equal(await tokenBalanceAmount.getText(), '43')
      }
    })
  })

  describe('Approves a custom token from dapp', () => {
    let gasModal
    it('approves an already created token', async () => {
      const windowHandles = await driver.getAllWindowHandles()
      const extension = windowHandles[0]
      const dapp = await switchToWindowWithTitle(driver, 'E2E Test Dapp', windowHandles)
      await closeAllWindowHandlesExcept(driver, [extension, dapp])
      await delay(regularDelayMs)

      await driver.switchTo().window(dapp)
      await delay(tinyDelayMs)

      const transferTokens = await findElement(driver, By.xpath(`//button[contains(text(), 'Approve Tokens')]`))
      await transferTokens.click()

      await closeAllWindowHandlesExcept(driver, extension)
      await driver.switchTo().window(extension)
      await delay(regularDelayMs)

      const [txListItem] = await findElements(driver, By.css('.tx-list-item'))
      const [txListValue] = await findElements(driver, By.css('.tx-list-value'))
      await driver.wait(until.elementTextMatches(txListValue, /0\sETH/))
      await txListItem.click()
      await delay(regularDelayMs)
    })

    it('displays the token approval data', async () => {
      const dataTab = await findElement(driver, By.xpath(`//li[contains(text(), 'Data')]`))
      dataTab.click()
      await (regularDelayMs)

      const functionType = await findElement(driver, By.css('.confirm-page-container-content__function-type'))
      const functionTypeText = await functionType.getText()
      assert.equal(functionTypeText, 'Approve')

      const confirmDataDiv = await findElement(driver, By.css('.confirm-page-container-content__data-box'))
      const confirmDataText = await confirmDataDiv.getText()
      assert.equal(confirmDataText.match(/0x095ea7b30000000000000000000000002f318c334780961fb129d2a6c30d0763d9a5c97/))

      const detailsTab = await findElement(driver, By.xpath(`//li[contains(text(), 'Details')]`))
      detailsTab.click()
      await (regularDelayMs)

      const approvalWarning = await findElement(driver, By.css('.confirm-page-container-warning__warning'))
      const approvalWarningText = await approvalWarning.getText()
      assert(approvalWarningText.match(/By approving this/))
      await (regularDelayMs)
    })

    it('opens the gas edit modal', async () => {
      const configureGas = await driver.wait(until.elementLocated(By.css('.confirm-detail-row__header-text--edit')))
      await configureGas.click()
      await delay(regularDelayMs)

      gasModal = await driver.findElement(By.css('span .modal'))
    })

    it('customizes gas', async () => {
      await driver.wait(until.elementLocated(By.css('.customize-gas__title')))

      const [gasPriceInput, gasLimitInput] = await findElements(driver, By.css('.customize-gas-input'))
      await gasPriceInput.clear()
      await delay(tinyDelayMs)
      await gasPriceInput.sendKeys('10')
      await delay(tinyDelayMs)
      await gasLimitInput.clear()
      await delay(tinyDelayMs)
      await gasLimitInput.sendKeys(Key.chord(Key.CONTROL, 'a'))
      await gasLimitInput.sendKeys('60000')
      await gasLimitInput.sendKeys(Key.chord(Key.CONTROL, 'e'))

      // Needed for different behaviour of input in different versions of firefox
      const gasLimitInputValue = await gasLimitInput.getAttribute('value')
      if (gasLimitInputValue === '600001') {
        await gasLimitInput.sendKeys(Key.BACK_SPACE)
      }

      const save = await findElement(driver, By.css('.customize-gas__save'))
      await save.click()
      await driver.wait(until.stalenessOf(gasModal))

      const gasFeeInputs = await findElements(driver, By.css('.confirm-detail-row__eth'))
      assert.equal(await gasFeeInputs[0].getText(), '♦ 0.0006')
    })

    it('submits the transaction', async function () {
      const confirmButton = await findElement(driver, By.xpath(`//button[contains(text(), 'Confirm')]`))
      await confirmButton.click()
      await delay(regularDelayMs)
    })

    it('finds the transaction in the transactions list', async function () {
      const txValues = await findElements(driver, By.css('.tx-list-value'))
      await driver.wait(until.elementTextMatches(txValues[0], /0\sETH/))
      const txStatuses = await findElements(driver, By.css('.tx-list-status'))
      await driver.wait(until.elementTextMatches(txStatuses[0], /Confirmed/))
    })
  })

  describe('Hide token', () => {
    it('hides the token when clicked', async () => {
      const [hideTokenEllipsis] = await findElements(driver, By.css('.token-list-item__ellipsis'))
      await hideTokenEllipsis.click()

      const byTokenMenuDropdownOption = By.css('.menu__item--clickable')
      const tokenMenuDropdownOption = await driver.wait(until.elementLocated(byTokenMenuDropdownOption))

      await tokenMenuDropdownOption.click()

      const confirmHideModal = await findElement(driver, By.css('span .modal'))

      const byHideTokenConfirmationButton = By.css('.hide-token-confirmation__button')
      const hideTokenConfirmationButton = await driver.wait(until.elementLocated(byHideTokenConfirmationButton))
      await hideTokenConfirmationButton.click()

      await driver.wait(until.stalenessOf(confirmHideModal))
    })
  })

  describe('Add existing token using search', () => {
    it('clicks on the Add Token button', async () => {
      const addToken = await findElement(driver, By.xpath(`//button[contains(text(), 'Add Token')]`))
      await addToken.click()
      await delay(regularDelayMs)
    })

    it('can pick a token from the existing options', async () => {
      const tokenSearch = await findElement(driver, By.css('#search-tokens'))
      await tokenSearch.sendKeys('BAT')
      await delay(regularDelayMs)

      const token = await findElement(driver, By.xpath("//span[contains(text(), 'BAT')]"))
      await token.click()
      await delay(regularDelayMs)

      const nextScreen = await findElement(driver, By.xpath(`//button[contains(text(), 'Next')]`))
      await nextScreen.click()
      await delay(regularDelayMs)

      const addTokens = await findElement(driver, By.xpath(`//button[contains(text(), 'Add Tokens')]`))
      await addTokens.click()
      await delay(largeDelayMs)
    })

    it('renders the balance for the chosen token', async () => {
      const balance = await findElement(driver, By.css('.tx-view .balance-display .token-amount'))
      await driver.wait(until.elementTextMatches(balance, /0\sBAT/))
      await delay(regularDelayMs)
    })
  })
})
