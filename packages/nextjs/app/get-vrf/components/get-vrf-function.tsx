import { ethers, AbiCoder, getAddress } from "ethers";
import { ambMessageRelayerAbi, ambAdapterAbi, vrfConsumerAbi, yahoAbi, yaruAbi, ambHelperAbi } from "./abi-imports";
import {
  yahoAddress,
  yaruAddress,
  vrfConsumerAddress,
  ambMessageRelayer,
  ambAdapter,
  ambHelper
} from "./contract-deployments";
import { goerliProvider, gnosisProvider, devWallet } from "../provider-setup";

export const getVRF =async (
  setRequestId: (requestId: string) => void,
  setLoading: (loading: boolean) => void
) =>  {
    console.log("Starting the process to get VRF...");

    setLoading(true);


    try {
        
      const signer = devWallet;
      const yahoContract = new ethers.Contract(yahoAddress, yahoAbi.abi, signer);
      const yaruContract = new ethers.Contract(yaruAddress, yaruAbi.abi, signer);
      const vrfConsumerContract = new ethers.Contract(vrfConsumerAddress, vrfConsumerAbi.abi, goerliProvider);
      const ambMessageRelayerContract = new ethers.Contract(ambMessageRelayer, ambMessageRelayerAbi.abi, gnosisProvider);
      const ambContractOnGoerli = new ethers.Contract(ambAdapter, ambAdapterAbi.abi, goerliProvider);
      const ambHelperContract = new ethers.Contract(ambHelper, ambHelperAbi.abi, gnosisProvider);


      const message = {
        toChainId: ethers.toBigInt(5),
        to: vrfConsumerAddress,
        data: vrfConsumerContract.interface.encodeFunctionData("requestRandomWords"),
      };

      // Step 1: Dispatch the message
      console.log("Dispatching message...");
      //Question: Is the AMB message relay supposed to be the same as the adapter in the Yaho contract?
      const dispatchTx = await yahoContract.dispatchMessagesToAdapters(
        [message],
        [ambMessageRelayerContract.address],
        [ambContractOnGoerli.address],
      );
      await dispatchTx.wait();
      console.log("Message dispatched.", dispatchTx);

      // Step 2: Get the signature
      console.log("Getting signature...");
      const coder = AbiCoder.defaultAbiCoder();
      const encodedData = coder.encode(["address", "bytes"], [vrfConsumerAddress, message.data]);
      console.log("Encoded data:", encodedData);
      const signature = await ambHelperContract.getSignatures(ambContractOnGoerli.address, encodedData);
      console.log("Signature obtained.", signature);

      // Step 3: Execute the signature
      console.log("Executing signature...");
      const executeSignatureTx = await ambContractOnGoerli.executeSignature(encodedData, signature);
      const executeSignatureReceipt = await executeSignatureTx.wait();
      console.log("Signature executed.");

      // Step 4: Extract the messageId from the event logs
      console.log("Extracting messageId...");
      const messageId = executeSignatureReceipt.events.find((event: any) => event.event === "MessageDispatched").args
        .messageId;
      console.log("MessageId extracted: ", messageId);

      // Step 5: Execute the message
      console.log("Executing message...");
      const executeTx = await yaruContract.executeMessages(
        [message],
        [messageId],
        [signer.address],
        [ambContractOnGoerli.address],
      );
      await executeTx.wait();
      console.log("Message executed.");

      // Step 6: Listen for the VRF response
      console.log("Listening for VRF response...");
      console.log('Message ID:', messageId);
      console.log("Listening for VRF response started.");

      setRequestId(messageId);
      console.log("Request ID set to state:", messageId);
    } catch (error) {
      console.error("Error getting VRF:", error);
      alert("There was an error fetching the VRF.");
    } finally {
      setLoading(false);
      console.log("Set loading to false");
    }
  };