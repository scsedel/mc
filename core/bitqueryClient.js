// core/bitqueryClient.js

const BITQUERY_URL = 'https://streaming.bitquery.io/graphql';

// Query di test: ultimi token Pump.fun creati (pochi campi base)
const TEST_QUERY = `
  query TestNewPumpfunTokens {
    Solana {
      pumpFunTokens(
        orderBy: { descending: block_time }
        limit: { count: 5 }
      ) {
        tokenAddress: mint
        name
        symbol
        createdAt: block_time
        devAddress: creator
        platform: platform
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

    const tokens = json.data?.solana?.pumpFunTokens ?? [];

    return tokens;
}

module.exports = {
    testNewPumpfunTokens,
};
