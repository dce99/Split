import { ethers } from "hardhat";

async function main() {

  const split = await ethers.deployContract("Split", [], { value: ethers.parseEther("100") });
  await split.waitForDeployment();

  if (process.env.host == "development") {
    const token = await ethers.deployContract("TetherToken", [ethers.parseEther("10000")]);
    await token.waitForDeployment();

    // Fund all local addresses with some tokens
    const tx1 = await token.transfer(ethers.getAddress(<string>process.env.addr1), ethers.parseEther('1000'));
    await tx1.wait();
    const tx2 = await token.transfer(ethers.getAddress(<string>process.env.addr2), ethers.parseEther('1000'));
    await tx2.wait();
    const tx3 = await token.transfer(ethers.getAddress(<string>process.env.addr3), ethers.parseEther('1000'));
    await tx3.wait();
    const tx4 = await token.transfer(ethers.getAddress(<string>process.env.addr4), ethers.parseEther('1000'));
    await tx4.wait();


    console.log('Deployed token', await token.getAddress());
  }

  console.log(
    'Deployed Split: ', await split.getAddress(),
  );

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
