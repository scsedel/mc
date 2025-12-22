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
      DEXPools(
        limit: { count: 1 }
        orderBy: { descending: Block_Slot }
        where: {
          Pool: {
            Market: {
              BaseCurrency: {
                MintAddress: { is: $mint }
              }
              QuoteCurrency: {
                MintAddress: {
                  in: [
                    "11111111111111111111111111111111"
                    "So11111111111111111111111111111111111111112"
                  ]
                }
              }
            }
            Dex: {
              ProgramAddress: {
                is: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
              }
            }
          }
          Transaction: { Result: { Success: true } }
        }
      ) {
        Bonding_Curve_Progress_precentage: calculate(
          expression: "100 - ((($Pool_Base_Balance - 206900000) * 100) / 793100000)"
        )
        Pool {
          Market {
            BaseCurrency {
              MintAddress
              Name
              Symbol
            }
            MarketAddress
            QuoteCurrency {
              MintAddress
              Name
              Symbol
            }
          }
          Dex {
            ProtocolName
            ProtocolFamily
          }
          Base {
            Balance: PostAmount
          }
          Quote {
            PostAmount
            PriceInUSD
            PostAmountInUSD
          }
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

    const tokenPool = json.data?.Solana?.DEXPools?.[0];
    if (!tokenPool) {
        throw new Error('Nessun pool Pump.fun trovato per questo mint');
    }

    const pool = tokenPool.Pool;
    const market = pool.Market;
    const base = pool.Base;
    const quote = pool.Quote;

    return {
        mintAddress: market.BaseCurrency?.MintAddress,
        name: market.BaseCurrency?.Name,
        symbol: market.BaseCurrency?.Symbol,
        bondingCurveProgress: tokenPool.Bonding_Curve_Progress_precentage ?? null,
        baseBalance: base?.Balance ?? null,
        priceUsd: quote?.PriceInUSD ?? null,
        liquidityUsd: quote?.PostAmountInUSD ?? null,
    };
}

module.exports = {
    testNewPumpfunTokens,
    getPumpfunTokenStats,
};
