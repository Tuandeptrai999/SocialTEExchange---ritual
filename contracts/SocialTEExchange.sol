// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRitualWallet {
    function deposit(uint256 lockDuration) external payable;
    function depositFor(address user, uint256 lockDuration) external payable;
    function withdraw(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function lockUntil(address account) external view returns (uint256);
}

contract SocialTEExchange {
    address constant HTTP_PRECOMPILE = 0x0000000000000000000000000000000000000801;
    address constant RITUAL_WALLET = 0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948;

    struct Certificate {
        address seller;
        address executor;
        bytes[] encryptedSecrets;
        bytes[] secretSignatures;
        string url;
        uint256 price;
        bool active;
    }

    struct HTTPResponse {
        uint16 status;
        string[] headerKeys;
        string[] headerValues;
        bytes body;
        string errorMessage;
    }

    uint256 public nextCertId;
    mapping(uint256 => Certificate) public certificates;

    event CertificateListed(uint256 indexed certId, address indexed seller, uint256 price);
    event CertificateUpdated(uint256 indexed certId, uint256 newPrice, bool active);
    event AccessPurchased(uint256 indexed certId, address indexed buyer);
    event DataFetched(uint256 indexed certId, address indexed buyer, uint16 status, bytes body);
    event RequestFailed(uint256 indexed certId, address indexed buyer, string error);

    // Deposit fees to RitualWallet for async precompiles
    function depositForFees(uint256 lockDuration) external payable {
        IRitualWallet(RITUAL_WALLET).deposit{value: msg.value}(lockDuration);
    }

    // List a new access certificate
    function listCertificate(
        address executor,
        bytes[] calldata encryptedSecrets,
        bytes[] calldata secretSignatures,
        string calldata url,
        uint256 price
    ) external returns (uint256) {
        uint256 certId = nextCertId++;
        
        certificates[certId] = Certificate({
            seller: msg.sender,
            executor: executor,
            encryptedSecrets: encryptedSecrets,
            secretSignatures: secretSignatures,
            url: url,
            price: price,
            active: true
        });

        emit CertificateListed(certId, msg.sender, price);
        return certId;
    }

    function toggleCertificate(uint256 certId, bool active) external {
        require(certificates[certId].seller == msg.sender, "Not seller");
        certificates[certId].active = active;
        emit CertificateUpdated(certId, certificates[certId].price, active);
    }

    function updatePrice(uint256 certId, uint256 newPrice) external {
        require(certificates[certId].seller == msg.sender, "Not seller");
        certificates[certId].price = newPrice;
        emit CertificateUpdated(certId, newPrice, certificates[certId].active);
    }

    // Request social data using the certificate
    // Buyer must have sufficient balance in RitualWallet (EOA)
    function requestSocialData(
        uint256 certId,
        uint256 ttl
    ) external payable returns (uint16, bytes memory) {
        Certificate memory cert = certificates[certId];
        require(cert.active, "Certificate not active");
        require(msg.value >= cert.price, "Insufficient payment");

        // Forward payment to seller
        if (cert.price > 0) {
            (bool success, ) = payable(cert.seller).call{value: cert.price}("");
            require(success, "Payment transfer failed");
        }

        // Return excess payment to buyer
        uint256 excess = msg.value - cert.price;
        if (excess > 0) {
            (bool success, ) = payable(msg.sender).call{value: excess}("");
            require(success, "Refund transfer failed");
        }

        bytes memory input = abi.encode(
            cert.executor,
            cert.encryptedSecrets,
            ttl,
            cert.secretSignatures,
            bytes(""), // userPublicKey
            cert.url,
            uint8(1), // GET
            new string[](0),
            new string[](0),
            bytes(""),
            uint256(0),
            uint8(0),
            false
        );

        (bool callSuccess, bytes memory rawOutput) = HTTP_PRECOMPILE.call(input);
        require(callSuccess, "Precompile call failed");

        (, bytes memory actualOutput) = abi.decode(rawOutput, (bytes, bytes));
        
        if (actualOutput.length == 0) {
            // Return empty response during simulation
            return (0, bytes(""));
        }

        HTTPResponse memory resp = abi.decode(actualOutput, (HTTPResponse));

        if (bytes(resp.errorMessage).length > 0) {
            emit RequestFailed(certId, msg.sender, resp.errorMessage);
            return (0, bytes(""));
        }

        emit DataFetched(certId, msg.sender, resp.status, resp.body);
        return (resp.status, resp.body);
    }
    
    receive() external payable {}
}
