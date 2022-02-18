import { task } from "hardhat/config";
import { KMS } from "aws-sdk";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as asn1js from "asn1.js";
import * as EthUtil from "ethereumjs-util";

export const kms = new KMS();

export default task("kms:get-key-eth-address", "Fetch the ETH address for a KMS Key ID")
  .addParam("kmsId", "KMS Key ID")
  .setAction(async (taskArguments) => {
    const kmsId = taskArguments.kmsId;

    const address = await getEthAddressFromKMS(kmsId);
    console.log("🏠 Address: ", address);
  });

const getPublicKey = (KeyId: KMS.GetPublicKeyRequest["KeyId"]) => kms.getPublicKey({ KeyId }).promise();

const getEthAddressFromKMS = async (keyId: KMS.GetPublicKeyRequest["KeyId"]) => {
  const KMSKey = await getPublicKey(keyId);
  if (!KMSKey.PublicKey) {
    throw new Error("Failed to get PublicKey from KMS");
  }
  return getEthAddressFromPublicKey(KMSKey.PublicKey);
};

const getEthAddressFromPublicKey = (publicKey: KMS.PublicKeyType): string => {
  const res = EcdsaPubKey.decode(publicKey as string, "der");
  let pubKeyBuffer: Buffer = res.pubKey.data;

  pubKeyBuffer = pubKeyBuffer.slice(1, pubKeyBuffer.length);

  const address = EthUtil.keccak256(pubKeyBuffer);
  const EthAddr = "0x" + address.slice(-20).toString("hex");

  return EthAddr;
};

const EcdsaPubKey = asn1js.define<{ pubKey: { data: Buffer } }>("EcdsaPubKey", function (this: any) {
  this.seq().obj(this.key("algo").seq().obj(this.key("a").objid(), this.key("b").objid()), this.key("pubKey").bitstr());
});
