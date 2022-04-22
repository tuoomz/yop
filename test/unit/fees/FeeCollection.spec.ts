import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import {
  FeeCollection,
  SingleAssetVault,
  VaultStrategyDataStore,
  VaultStrategyDataStore__factory, // eslint-disable-line
  SingleAssetVault__factory, // eslint-disable-line
  CurveStable,
  TokenMock__factory, // eslint-disable-line
  TokenMock,
} from "../../../types";
import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import chai, { expect } from "chai";
import { impersonate } from "../utils/Impersonate";
import { CONST } from "../../constants";

chai.use(smock.matchers);

describe("FeeCollection", () => {
  let deployer: SignerWithAddress;
  let governance: SignerWithAddress;
  let gatekeeper: SignerWithAddress;
  let vaultCreator: SignerWithAddress;
  let protocolWallet: SignerWithAddress;
  let protocolWalletUpdated: SignerWithAddress;
  let accessManager: SignerWithAddress;
  let proposer: SignerWithAddress;
  let developer: SignerWithAddress;
  let yopRewards: SignerWithAddress;
  let vault: MockContract<SingleAssetVault>;
  let token: MockContract<TokenMock>;
  let token2: MockContract<TokenMock>;
  let strategy: FakeContract<CurveStable>;
  let feeCollection: FeeCollection;
  let strategyDataStore: MockContract<VaultStrategyDataStore>;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  const defaultVaultCreatorFeeRatio = 2000;
  const defaultProposerFeeRatio = 1000;
  const defaultDeveloperFeeRatio = 3000;

  beforeEach(async () => {
    [deployer, governance, gatekeeper, protocolWallet, protocolWalletUpdated, vaultCreator, accessManager, yopRewards, proposer, developer] =
      await ethers.getSigners();
    const FeeCollectionFactory = await ethers.getContractFactory("FeeCollection");
    feeCollection = (await FeeCollectionFactory.deploy()) as FeeCollection;
    await feeCollection.deployed();

    // solhint-disable-next-line
    const StrategyDataStore = await smock.mock<VaultStrategyDataStore__factory>("VaultStrategyDataStore"); // eslint-disable-line
    strategyDataStore = await StrategyDataStore.deploy(governance.address);
    const TokenMock = await smock.mock<TokenMock__factory>("TokenMock"); // eslint-disable-line
    token = await TokenMock.deploy("vaultToken", "token");
    await token.deployed();
    token.allowance.returns(0);
    token.transferFrom.returns(true);
    token.transfer.returns(true);

    token2 = await TokenMock.deploy("vaultToken2", "token2");
    await token2.deployed();
    token2.allowance.returns(0);
    token2.transferFrom.returns(true);
    token2.transfer.returns(true);

    const VaultUtilsFactory = await ethers.getContractFactory("VaultUtils");
    const vaultUtils = await VaultUtilsFactory.deploy();
    // eslint-disable-next-line camelcase
    const Vault = await smock.mock<SingleAssetVault__factory>("SingleAssetVault", {
      libraries: {
        VaultUtils: vaultUtils.address,
      },
    });
    vault = await Vault.deploy();
    await vault.deployed();
    vault.creator.returns(vaultCreator.address);
    vault.token.returns(token.address);

    strategy = await smock.fake<CurveStable>("CurveStable");
    strategy.strategyProposer.returns(proposer.address);
    strategy.strategyDeveloper.returns(developer.address);
    strategyDataStore.vaultStrategies.returns([strategy.address]);
    strategy.vault.returns(vault.address);

    await feeCollection.initialize(
      governance.address,
      gatekeeper.address,
      protocolWallet.address,
      strategyDataStore.address,
      defaultVaultCreatorFeeRatio,
      defaultProposerFeeRatio,
      defaultDeveloperFeeRatio
    );
  });

  describe("Initialize", () => {
    it("Can't be initialized again", async () => {
      await expect(
        feeCollection.initialize(
          governance.address,
          gatekeeper.address,
          protocolWallet.address,
          strategyDataStore.address,
          defaultVaultCreatorFeeRatio,
          defaultProposerFeeRatio,
          defaultDeveloperFeeRatio
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
    it("should be initialized with the correct values", async () => {
      expect(await feeCollection.defaultVaultCreatorFeeRatio()).to.be.equal(defaultVaultCreatorFeeRatio);
      expect(await feeCollection.defaultStrategyDeveloperFeeRatio()).to.be.equal(defaultDeveloperFeeRatio);
      expect(await feeCollection.defaultStrategyProposerFeeRatio()).to.be.equal(defaultProposerFeeRatio);
    });
    it("should fail to initialize if protocol wallet is address 0", async () => {
      const FeeCollectionFactory = await ethers.getContractFactory("FeeCollection");
      const feeCollectionContract = (await FeeCollectionFactory.deploy()) as FeeCollection;
      await feeCollectionContract.deployed();
      await expect(
        feeCollectionContract.initialize(
          governance.address,
          gatekeeper.address,
          ethers.constants.AddressZero,
          strategyDataStore.address,
          defaultVaultCreatorFeeRatio,
          defaultProposerFeeRatio,
          defaultDeveloperFeeRatio
        )
      ).to.be.revertedWith("invalid wallet address");
    });
    it("should fail to initialize if strategy datastore is address 0", async () => {
      const FeeCollectionFactory = await ethers.getContractFactory("FeeCollection");
      const feeCollectionContract = (await FeeCollectionFactory.deploy()) as FeeCollection;
      await feeCollectionContract.deployed();
      await expect(
        feeCollectionContract.initialize(
          governance.address,
          gatekeeper.address,
          protocolWallet.address,
          ethers.constants.AddressZero,
          defaultVaultCreatorFeeRatio,
          defaultProposerFeeRatio,
          defaultDeveloperFeeRatio
        )
      ).to.be.revertedWith("invalid DataStore address");
    });
  });

  describe("Set Correct Values", () => {
    it("should set the correct DefaultVaultCreatorFeeRatio", async () => {
      const defaultVaultCreatorFeeRatio = 1000;
      await feeCollection.connect(governance).setDefaultVaultCreatorFeeRatio(defaultVaultCreatorFeeRatio);
      expect(await feeCollection.getVaultCreatorFeeRatio(vault.address)).to.be.equal(defaultVaultCreatorFeeRatio);
    });
    it("should not set the correct DefaultVaultCreatorFeeRatio to greater than 100%", async () => {
      const defaultVaultCreatorFeeRatio = 10001;
      expect(feeCollection.connect(governance).setDefaultVaultCreatorFeeRatio(defaultVaultCreatorFeeRatio)).to.be.revertedWith("!ratio");
    });

    it("should set the correct DefaultStrategyFeeRatio", async () => {
      const defaultStrategyProposerFeeRatio = 1500;
      const defaultStrategyDeveloperFeeRatio = 2000;
      await feeCollection.connect(governance).setDefaultStrategyFeeRatio(defaultStrategyProposerFeeRatio, defaultStrategyDeveloperFeeRatio);
      expect(await feeCollection.connect(await impersonate(vault.address)).getStrategyProposerFeeRatio(strategy.address)).to.be.equal(
        defaultStrategyProposerFeeRatio
      );
      expect(await feeCollection.connect(await impersonate(vault.address)).getStrategyDeveloperFeeRatio(strategy.address)).to.be.equal(
        defaultStrategyDeveloperFeeRatio
      );
    });

    it("should only be able to set ratios as governance ", async () => {
      await expect(feeCollection.setDefaultVaultCreatorFeeRatio(defaultVaultCreatorFeeRatio)).to.be.revertedWith("governance only");
      await expect(feeCollection.setDefaultStrategyFeeRatio(defaultProposerFeeRatio, defaultDeveloperFeeRatio)).to.be.revertedWith(
        "governance only"
      );
      await expect(feeCollection.setVaultCreatorFeeRatio(vault.address, defaultVaultCreatorFeeRatio)).to.be.revertedWith("governance only");
      await expect(feeCollection.setStrategyFeeRatio(strategy.address, defaultProposerFeeRatio, defaultDeveloperFeeRatio)).to.be.revertedWith(
        "governance only"
      );
    });

    it("should revert if vault address is not valid", async () => {
      const vaultCreatorFeeRatio = 500;
      expect(feeCollection.connect(governance).setVaultCreatorFeeRatio(ethers.constants.AddressZero, vaultCreatorFeeRatio)).to.be.revertedWith(
        "!vault"
      );
    });

    it("should set the correct VaultCreatorFeeRatio", async () => {
      const vaultCreatorFeeRatio = 500;
      await feeCollection.connect(governance).setVaultCreatorFeeRatio(vault.address, vaultCreatorFeeRatio);
      expect(await feeCollection.getVaultCreatorFeeRatio(vault.address)).to.be.equal(vaultCreatorFeeRatio);
    });

    it("should set the VaultCreatorFeeRatio greater than 100%", async () => {
      const vaultCreatorFeeRatio = 10001;
      expect(feeCollection.connect(governance).setVaultCreatorFeeRatio(vault.address, vaultCreatorFeeRatio)).to.be.revertedWith("!ratio");
    });

    it("should set the correct StrategyFeeRatio", async () => {
      const proposerFeeRatio = 750;
      const developerFeeRatio = 100;
      await feeCollection.connect(governance).setStrategyFeeRatio(strategy.address, proposerFeeRatio, developerFeeRatio);
      expect(await feeCollection.connect(await impersonate(vault.address)).getStrategyProposerFeeRatio(strategy.address)).to.be.equal(
        proposerFeeRatio
      );
      expect(await feeCollection.connect(await impersonate(vault.address)).getStrategyDeveloperFeeRatio(strategy.address)).to.be.equal(
        developerFeeRatio
      );
    });

    it("should not set the combined proposer and developer to greater than 100%", async () => {
      const strategyProposerFeeRatio = 5000;
      const strategyDeveloperFeeRatio = 5001;
      await expect(
        feeCollection.connect(governance).setStrategyFeeRatio(strategy.address, strategyProposerFeeRatio, strategyDeveloperFeeRatio)
      ).to.be.revertedWith("!ratio");
    });
    it("should not set defaultStrategyFeeRatio to greater than 100%", async () => {
      let proposerRatio = 10001;
      let developerRatio = 0;
      await expect(feeCollection.connect(governance).setDefaultStrategyFeeRatio(proposerRatio, developerRatio)).to.be.revertedWith("!ratio");
      proposerRatio = 0;
      developerRatio = 10001;
      await expect(feeCollection.connect(governance).setDefaultStrategyFeeRatio(proposerRatio, developerRatio)).to.be.revertedWith("!ratio");
      proposerRatio = 5000;
      developerRatio = 5001;
      await expect(feeCollection.connect(governance).setDefaultStrategyFeeRatio(proposerRatio, developerRatio)).to.be.revertedWith("!ratio");
    });

    it("should set the protocol wallet address", async () => {
      await expect(feeCollection.connect(governance).setProtocolWallet(ethers.constants.AddressZero)).to.be.revertedWith("!wallet");
      await feeCollection.connect(governance).setProtocolWallet(protocolWalletUpdated.address);
      expect(await feeCollection.connect(await impersonate(vault.address)).protocolWallet()).to.be.equal(protocolWalletUpdated.address);
    });
  });

  describe("Collect Manage fees", async () => {
    const fees = ethers.utils.parseEther("1");
    const vaultFees = fees.mul(defaultVaultCreatorFeeRatio).div(CONST.MAX_BPS);
    const prototcolFees = fees.sub(vaultFees);
    it("should no creator fee if creator is not set", async () => {
      vault.creator.returns(ethers.constants.AddressZero);
      expect(await feeCollection.connect(await impersonate(vault.address)).collectManageFee(fees))
        .to.emit(feeCollection, "ManageFeesCollected")
        .withArgs(vault.address, token.address, ethers.constants.Zero, fees);
    });
    it("Should transfer fund from the vault", async () => {
      expect(await feeCollection.connect(await impersonate(vault.address)).collectManageFee(fees))
        .to.emit(feeCollection, "ManageFeesCollected")
        .withArgs(vault.address, token.address, vaultFees, prototcolFees);
      expect(token.transferFrom).to.have.been.calledOnceWith(vault.address, feeCollection.address, fees);
      expect(await feeCollection.connect(vaultCreator.address).feesAvailableForToken(token.address)).to.be.equal(vaultFees);
      expect(await feeCollection.connect(protocolWallet.address).feesAvailableForToken(token.address)).to.be.equal(prototcolFees);
    });
    it("Should revert when calling collectManageFee from a non vault", async () => {
      strategyDataStore.vaultStrategies.returns();
      await expect(feeCollection.collectManageFee(fees)).to.be.revertedWith("!vault");
    });
  });

  describe("Collect Performance Fee", async () => {
    const fees = ethers.utils.parseEther("1");
    const proposerFees = fees.mul(defaultProposerFeeRatio).div(CONST.MAX_BPS);
    const developerFees = fees.mul(defaultDeveloperFeeRatio).div(CONST.MAX_BPS);
    const prototcolFees = fees.sub(proposerFees.add(developerFees));
    it("should revert if strategy address is not valid", async () => {
      expect(
        feeCollection.connect(await impersonate(vault.address)).collectPerformanceFee(ethers.constants.AddressZero, fees)
      ).to.be.revertedWith("invalid strategy");
    });
    it("should no proposer or developer fees if they are not set", async () => {
      strategy.strategyProposer.returns(ethers.constants.AddressZero);
      strategy.strategyDeveloper.returns(ethers.constants.AddressZero);
      expect(await feeCollection.connect(await impersonate(vault.address)).collectPerformanceFee(strategy.address, fees))
        .to.emit(feeCollection, "PerformanceFeesCollected")
        .withArgs(strategy.address, token.address, ethers.constants.Zero, ethers.constants.Zero, fees);
    });

    it("Should transfer fund from the vault", async () => {
      expect(await feeCollection.connect(await impersonate(vault.address)).collectPerformanceFee(strategy.address, fees))
        .to.emit(feeCollection, "PerformanceFeesCollected")
        .withArgs(strategy.address, token.address, proposerFees, developerFees, prototcolFees);
      expect(token.transferFrom).to.have.been.calledOnceWith(vault.address, feeCollection.address, fees);
      expect(await feeCollection.connect(await impersonate(proposer.address)).feesAvailableForToken(token.address)).to.be.equal(proposerFees);
      expect(await feeCollection.connect(await impersonate(developer.address)).feesAvailableForToken(token.address)).to.be.equal(developerFees);
      expect(await feeCollection.connect(await impersonate(protocolWallet.address)).feesAvailableForToken(token.address)).to.be.equal(
        prototcolFees
      );
    });
    it("Should revert when calling collectPerformanceFee from a non vault", async () => {
      strategyDataStore.vaultStrategies.returns();
      await expect(feeCollection.collectPerformanceFee(strategy.address, fees)).to.be.revertedWith("!vault");
    });
  });

  describe("Claim Fees", () => {
    it("should no transfer if there is no fees to claim", async () => {
      expect(await feeCollection.connect(developer).claimFeesForToken(token.address)).not.to.emit(feeCollection, "FeesClaimed");
    });
    it("claim fees for token", async () => {
      const fees = ethers.utils.parseEther("1");
      const developerFees = fees.mul(defaultDeveloperFeeRatio).div(CONST.MAX_BPS);
      expect(await feeCollection.connect(await impersonate(vault.address)).collectPerformanceFee(strategy.address, fees));
      expect((await feeCollection.connect(developer).allAvailableFees())[0][1]).to.be.equal(developerFees);
      expect(await feeCollection.connect(developer).claimFeesForToken(token.address))
        .to.emit(feeCollection, "FeesClaimed")
        .withArgs(developer.address, token.address, developerFees);
      expect(token.transfer).to.be.calledOnceWith(developer.address, developerFees);
      expect(await feeCollection.feesAvailableForToken(token.address)).to.be.be.equal(0);
    });

    it("claim all fees", async () => {
      const fees = ethers.utils.parseEther("1");
      const developerFees = fees.mul(defaultDeveloperFeeRatio).div(CONST.MAX_BPS);
      expect(await feeCollection.connect(await impersonate(vault.address)).collectPerformanceFee(strategy.address, fees));

      // Collect performance fees for a second token
      const fees2 = ethers.utils.parseEther("1");
      const developerFees2 = fees2.mul(defaultDeveloperFeeRatio).div(CONST.MAX_BPS);
      vault.token.returns(token2.address);
      expect(await feeCollection.connect(await impersonate(vault.address)).collectPerformanceFee(strategy.address, fees));

      expect(await feeCollection.connect(developer).claimAllFees())
        .to.emit(feeCollection, "FeesClaimed")
        .withArgs(developer.address, token.address, developerFees)
        .to.emit(feeCollection, "FeesClaimed")
        .withArgs(developer.address, token2.address, developerFees);

      expect(token.transfer).to.be.calledOnceWith(developer.address, developerFees);
      expect(token2.transfer).to.be.calledOnceWith(developer.address, developerFees2);
    });
  });
});
