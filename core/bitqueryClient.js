// core/bitqueryClient.js

const BITQUERY_URL = 'https://streaming.bitquery.io/graphql';

// Query di test: ultimi token Pump.fun creati (pochi campi base)
const TEST_QUERY = `
  query TestNewPumpfunTokens {
    Solana {
      TokenSupplyUpdates(
        limit: { count: 5 }
        orderBy: { descending: Block_Time }
        where: {
          Instruction: {
            Program: {
              Address: { is: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" }
            }
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
          }
        }
        TokenSupplyUpdate {
          PostBalance
          Currency {
            MintAddress
            Name
            Symbol
            Uri
            UpdateAuthority
            ProgramAddress
          }
        }
        Transaction {
          Signer
          Signature
        }
      }
    }
  }
`;

const STATS_QUERY = `
  query PumpfunTokenStats($mint: String!) {
    Solana {
      PumpFunMarketcap(
        where: { MintAddress: { is: $mint } }
        limit: { count: 1 }
      ) {
        MintAddress
        Name
        Symbol
        PriceInUSD
        MarketCapInUSD
        Volume24hInUSD
        LiquidityInUSD
        BondingCurveProgress
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

    const now = new Date();

    const tokens = updates
        .map((u) => {
            const createdAtStr = u.Block?.Time;
            const createdAt = createdAtStr ? new Date(createdAtStr) : null;
            const ageMs = createdAt ? now - createdAt : null;
            const ageMinutes = ageMs != null ? ageMs / 60000 : null;

            return {
                createdAt: createdAtStr,
                ageMinutes,
                devAddress: u.Transaction?.Signer,
                mintAddress: u.TokenSupplyUpdate?.Currency?.MintAddress,
                name: u.TokenSupplyUpdate?.Currency?.Name,
                symbol: u.TokenSupplyUpdate?.Currency?.Symbol,
                metadataUri: u.TokenSupplyUpdate?.Currency?.Uri,
                programName: u.Instruction?.Program?.Name,
                programAddress: u.Instruction?.Program?.Address,
            };
        })
        // Filtra solo token con Age < 60 minuti
        .filter((t) => t.ageMinutes != null && t.ageMinutes < 60);

    return tokens;
}

async function getPumpfunTokenStats(mintAddress) {
    const apiToken = process.env.BITQUERY_V2_TOKEN;
    if (!apiToken) {
        throw new Error('BITQUERY_V2_TOKEN non impostata nelle variabili di ambiente');
    }
    if (!mintAddress) {
        throw new Error('mintAddress è obbligatorio');
    }

    const response = await fetch(BITQUERY_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
            query: STATS_QUERY,
            variables: { mint: mintAddress },
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Bitquery HTTP ${response.status}: ${text}`);
    }

    const json = await response.json();

    if (json.errors && json.errors.length) {
        throw new Error(`Bitquery errors: ${JSON.stringify(json.errors)}`);
    }

    const token = json.data?.Solana?.PumpFunMarketcap?.[0];
    if (!token) {
        throw new Error('Nessun dato trovato per questo mint (non sembra un token Pump.fun o manca ancora marketcap)');
    }

    return {
        mintAddress: token.MintAddress,
        name: token.Name,
        symbol: token.Symbol,
        priceUsd: token.PriceInUSD ?? null,
        marketCapUsd: token.MarketCapInUSD ?? null,
        volume24hUsd: token.Volume24hInUSD ?? null,
        liquidityUsd: token.LiquidityInUSD ?? null,
        bondingCurveProgress: token.BondingCurveProgress ?? null,
    };
}

module.exports = {
    testNewPumpfunTokens,
    getPumpfunTokenStats,
};
