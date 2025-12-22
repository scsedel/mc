// core/bitqueryClient.js

const BITQUERY_URL = 'https://streaming.bitquery.io/graphql';

// Query di test: ultimi token Pump.fun creati (pochi campi base)
const TEST_QUERY = `
  query TestNewPumpfunTokens {
    Solana(dataset: realtime) {
      TokenSupplyUpdates(
        limit: { count: 5 }
        orderBy: { descending: Block_Time }
        where: {
          Instruction: {
            Program: { Name: { is: "pump" } }
            Method: { is: "create" }
          }
          Transaction: { Result: { Success: true } }
        }
      ) {
        Block {
          Time
        }
        Instruction {
          Program {
            Address
            Name
            Method
          }
        }
        TokenSupplyUpdate {
          Currency {
            MintAddress
            Name
            Symbol
            MetadataAddress
            Uri
            UpdateAuthority
          }
          PostBalance
        }
        Transaction {
          Signer
          Signature
        }
      }
    }
  }
`;

async function testNewPumpfunTokens() {
    const apiToken = process.env.BITQUERY_V2_TOKEN;

    if (!apiToken) {
        throw new Error('BITQUERY_V2_TOKEN non impostata nelle variabili di ambiente');
    }

    const response = await fetch(BITQUERY_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            // Bitquery V2 usa Bearer token
            'Authorization': `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ query: TEST_QUERY }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Bitquery HTTP ${response.status}: ${text}`);
    }

    const json = await response.json();

    if (json.errors && json.errors.length) {
        throw new Error(`Bitquery errors: ${JSON.stringify(json.errors)}`);
    }

    const updates = json.data?.Solana?.TokenSupplyUpdates ?? [];

    const tokens = updates.map((u) => ({
        createdAt: u.Block?.Time,
        devAddress: u.Transaction?.Signer,
        mintAddress: u.TokenSupplyUpdate?.Currency?.MintAddress,
        name: u.TokenSupplyUpdate?.Currency?.Name,
        symbol: u.TokenSupplyUpdate?.Currency?.Symbol,
        metadataUri: u.TokenSupplyUpdate?.Currency?.Uri,
        programName: u.Instruction?.Program?.Name,
        programMethod: u.Instruction?.Program?.Method,
    }));

    return tokens;
}

module.exports = {
    testNewPumpfunTokens,
};
