// =====================================================
// Demo data — MANNOL POS (modo demo sin Firebase)
// =====================================================

export const DEMO_WAREHOUSES = [
  {
    id: "wh-vibora",
    name: "Víbora",
    code: "VIB",
    address: "Obispo #45, Habana Vieja",
    phone: "+53 7 866-2020",
    active: true,
    pin: "2611",
    hasPin: true,
    sellerCommissionPercent: 3,
    sellerCommissionCurrency: "USD",
    createdAt: Date.now() - 86400000 * 30,
  },
  {
    id: "wh-lisa",
    name: "Lisa",
    code: "LIS",
    address: "Av. 51 #7308, La Lisa",
    phone: "+53 7 855-3030",
    active: true,
    pin: "5807",
    hasPin: true,
    sellerCommissionPercent: 3,
    sellerCommissionCurrency: "USD",
    createdAt: Date.now() - 86400000 * 25,
  },
  {
    id: "wh-playa",
    name: "Playa",
    code: "PLY",
    address: "Calle 70 #1108, Miramar",
    phone: "+53 7 855-4040",
    active: true,
    pin: "7310",
    hasPin: true,
    sellerCommissionPercent: 4,
    sellerCommissionCurrency: "USD",
    createdAt: Date.now() - 86400000 * 20,
  },
  {
    id: "wh-centro",
    name: "Centro Habana",
    code: "CHB",
    address: "Galiano #258, Centro Habana",
    phone: "+53 7 866-5050",
    active: true,
    pin: "3009",
    hasPin: true,
    sellerCommissionPercent: 3,
    sellerCommissionCurrency: "USD",
    createdAt: Date.now() - 86400000 * 15,
  },
];

export const DEMO_MANAGERS = [
  { id: "mg-001", name: "Carlos Martínez", code: "CM", phone: "+53 5 123-4567", email: "carlos@mannol.cu", commission: 5, active: true, createdAt: Date.now() - 86400000 * 40 },
  { id: "mg-002", name: "Ana Rodríguez", code: "AR", phone: "+53 5 234-5678", email: "ana@mannol.cu", commission: 5, active: true, createdAt: Date.now() - 86400000 * 35 },
  { id: "mg-003", name: "José Pérez", code: "JP", phone: "+53 5 345-6789", email: "jose@mannol.cu", commission: 7, active: true, createdAt: Date.now() - 86400000 * 30 },
  { id: "mg-004", name: "María González", code: "MG", phone: "+53 5 456-7890", email: "maria@mannol.cu", commission: 5, active: true, createdAt: Date.now() - 86400000 * 25 },
];

export const DEMO_CARDS = [
  { id: "card-001", name: "BPA Principal", number: "9225-6789-0123-4567", bank: "BPA", active: true, createdAt: Date.now() - 86400000 * 50 },
  { id: "card-002", name: "BANDEC Ventas", number: "9226-1111-2222-3333", bank: "BANDEC", active: true, createdAt: Date.now() - 86400000 * 45 },
  { id: "card-003", name: "BANMET Oficial", number: "9227-4444-5555-6666", bank: "BANMET", active: true, createdAt: Date.now() - 86400000 * 40 },
  { id: "card-004", name: "BPA Secundaria", number: "9225-7777-8888-9999", bank: "BPA", active: true, createdAt: Date.now() - 86400000 * 35 },
];

export const DEMO_CATEGORIES = [
  { id: "cat-1", name: "Aceites de Motor", slug: "aceites-motor", color: "emerald", icon: "🛢️", parentId: null, sortOrder: 1, active: true },
  { id: "cat-1-1", name: "Sintéticos", slug: "sinteticos", color: "emerald", parentId: "cat-1", sortOrder: 1, active: true },
  { id: "cat-1-2", name: "Minerales", slug: "minerales", color: "emerald", parentId: "cat-1", sortOrder: 2, active: true },
  { id: "cat-2", name: "Filtros", slug: "filtros", color: "blue", icon: "🔧", parentId: null, sortOrder: 2, active: true },
  { id: "cat-2-1", name: "Aceite", slug: "aceite", color: "blue", parentId: "cat-2", sortOrder: 1, active: true },
  { id: "cat-2-2", name: "Aire", slug: "aire", color: "blue", parentId: "cat-2", sortOrder: 2, active: true },
  { id: "cat-3", name: "Líquidos", slug: "liquidos", color: "cyan", icon: "💧", parentId: null, sortOrder: 3, active: true },
  { id: "cat-4", name: "Accesorios", slug: "accesorios", color: "amber", icon: "⚙️", parentId: null, sortOrder: 4, active: true },
];

export const DEMO_PRODUCTS = [
  { id: "pr-001", name: "MANNOL Energy Formula 5W-30", brand: "MANNOL", viscosity: "5W-30", sku: "MN-7511", volumeLiters: 4, costPrice: 18, salePrice: 25, minStock: 5,
    gestorCommission: 1.5, gestorCommissionCurrency: "USD", vendorCommission: 100, vendorCommissionCurrency: "MN",
    categoryId: "cat-1-1", categoryName: "Sintéticos", active: true, createdAt: Date.now() - 86400000 * 60 },
  { id: "pr-002", name: "MANNOL Energy Formula 10W-40", brand: "MANNOL", viscosity: "10W-40", sku: "MN-7512", volumeLiters: 4, costPrice: 16, salePrice: 22, minStock: 5,
    gestorCommission: 1.2, gestorCommissionCurrency: "USD", vendorCommission: 90, vendorCommissionCurrency: "MN",
    categoryId: "cat-1-1", categoryName: "Sintéticos", active: true, createdAt: Date.now() - 86400000 * 58 },
  { id: "pr-003", name: "MANNOL Universal 15W-40", brand: "MANNOL", viscosity: "15W-40", sku: "MN-7515", volumeLiters: 4, costPrice: 12, salePrice: 17, minStock: 8,
    gestorCommission: 1.0, gestorCommissionCurrency: "USD", vendorCommission: 70, vendorCommissionCurrency: "MN",
    categoryId: "cat-1-2", categoryName: "Minerales", active: true, createdAt: Date.now() - 86400000 * 55 },
  { id: "pr-004", name: "MANNOL Diesel 5W-30", brand: "MANNOL", viscosity: "5W-30", sku: "MN-7521", volumeLiters: 5, costPrice: 22, salePrice: 30, minStock: 5,
    gestorCommission: 1.8, gestorCommissionCurrency: "USD", vendorCommission: 120, vendorCommissionCurrency: "MN",
    categoryId: "cat-1-1", categoryName: "Sintéticos", active: true, createdAt: Date.now() - 86400000 * 50 },
  { id: "pr-005", name: "MANNOL Premium 0W-20", brand: "MANNOL", viscosity: "0W-20", sku: "MN-7531", volumeLiters: 4, costPrice: 28, salePrice: 38, minStock: 3,
    gestorCommission: 2.5, gestorCommissionCurrency: "USD", vendorCommission: 150, vendorCommissionCurrency: "MN",
    categoryId: "cat-1-1", categoryName: "Sintéticos", active: true, createdAt: Date.now() - 86400000 * 45 },
  { id: "pr-006", name: "Filtro de Aceite Mannol W712/93", brand: "MANNOL", sku: "MN-W71293", costPrice: 3, salePrice: 5, minStock: 10,
    gestorCommission: 0.5, gestorCommissionCurrency: "USD", vendorCommission: 20, vendorCommissionCurrency: "MN",
    categoryId: "cat-2-1", categoryName: "Aceite", active: true, createdAt: Date.now() - 86400000 * 40 },
  { id: "pr-007", name: "Filtro de Aceite Mannol W610/1", brand: "MANNOL", sku: "MN-W6101", costPrice: 3, salePrice: 5, minStock: 10,
    gestorCommission: 0.5, gestorCommissionCurrency: "USD", vendorCommission: 20, vendorCommissionCurrency: "MN",
    categoryId: "cat-2-1", categoryName: "Aceite", active: true, createdAt: Date.now() - 86400000 * 38 },
  { id: "pr-008", name: "Filtro de Aire Mannol C30530", brand: "MANNOL", sku: "MN-C30530", costPrice: 5, salePrice: 8, minStock: 8,
    gestorCommission: 0.8, gestorCommissionCurrency: "USD", vendorCommission: 30, vendorCommissionCurrency: "MN",
    categoryId: "cat-2-2", categoryName: "Aire", active: true, createdAt: Date.now() - 86400000 * 35 },
  { id: "pr-009", name: "Líquido Frenos Mannol DOT 4", brand: "MANNOL", sku: "MN-9890", volumeLiters: 1, costPrice: 3, salePrice: 5, minStock: 10,
    gestorCommission: 0.5, gestorCommissionCurrency: "USD", vendorCommission: 20, vendorCommissionCurrency: "MN",
    categoryId: "cat-3", categoryName: "Líquidos", active: true, createdAt: Date.now() - 86400000 * 30 },
  { id: "pr-010", name: "Refrigerante Mannol G12+", brand: "MANNOL", sku: "MN-4012", volumeLiters: 1, costPrice: 4, salePrice: 7, minStock: 10,
    gestorCommission: 0.7, gestorCommissionCurrency: "USD", vendorCommission: 25, vendorCommissionCurrency: "MN",
    categoryId: "cat-3", categoryName: "Líquidos", active: true, createdAt: Date.now() - 86400000 * 28 },
  { id: "pr-011", name: "Líquido Limpiaparabrisas -10°C", brand: "MANNOL", sku: "MN-9930", volumeLiters: 4, costPrice: 4, salePrice: 7, minStock: 8,
    gestorCommission: 0.7, gestorCommissionCurrency: "USD", vendorCommission: 25, vendorCommissionCurrency: "MN",
    categoryId: "cat-3", categoryName: "Líquidos", active: true, createdAt: Date.now() - 86400000 * 25 },
  { id: "pr-012", name: "Grasa Multiuso Mannol 400g", brand: "MANNOL", sku: "MN-8020", costPrice: 4, salePrice: 7, minStock: 8,
    gestorCommission: 0.7, gestorCommissionCurrency: "USD", vendorCommission: 25, vendorCommissionCurrency: "MN",
    categoryId: "cat-4", categoryName: "Accesorios", active: true, createdAt: Date.now() - 86400000 * 20 },
];

// Generar stock para cada producto en cada almacén
export const DEMO_STOCK = (() => {
  const stock = [];
  for (const w of DEMO_WAREHOUSES) {
    for (const p of DEMO_PRODUCTS) {
      const qty = Math.floor(Math.random() * 30) + 5;
      stock.push({
        id: `${w.id}_${p.id}`,
        warehouseId: w.id,
        productId: p.id,
        quantity: qty,
        localPrice: p.salePrice,
        minStock: p.minStock,
        updatedAt: Date.now() - 86400000 * 2,
      });
    }
  }
  return stock;
})();

// Generar ventas demo (últimos 30 días)
export const DEMO_SALES = (() => {
  const sales = [];
  let codeCounter = 1;
  const managers = DEMO_MANAGERS;
  const products = DEMO_PRODUCTS;
  const warehouses = DEMO_WAREHOUSES;
  const cards = DEMO_CARDS;

  for (let day = 29; day >= 0; day--) {
    const dayStart = Date.now() - day * 86400000;
    const salesPerDay = Math.floor(Math.random() * 5) + 1;
    for (let i = 0; i < salesPerDay; i++) {
      const w = warehouses[Math.floor(Math.random() * warehouses.length)];
      const m = managers[Math.floor(Math.random() * managers.length)];
      const itemCount = Math.floor(Math.random() * 3) + 1;
      const items = [];
      let total = 0;
      for (let j = 0; j < itemCount; j++) {
        const p = products[Math.floor(Math.random() * products.length)];
        const qty = Math.floor(Math.random() * 3) + 1;
        const subtotal = p.salePrice * qty;
        items.push({
          productId: p.id,
          productName: p.name,
          brand: p.brand,
          quantity: qty,
          unitPrice: p.salePrice,
          subtotal,
          commission: p.commission,
          commissionCurrency: p.commissionCurrency,
        });
        total += subtotal;
      }
      const currency = ["USD", "MN", "EUR", "TRANSFERENCIA"][Math.floor(Math.random() * 4)];
      const status = Math.random() > 0.1 ? "COMPLETADA" : (Math.random() > 0.5 ? "PENDIENTE" : "CANCELADA");
      const card = currency === "TRANSFERENCIA" ? cards[Math.floor(Math.random() * cards.length)] : null;
      const code = `V-${String(codeCounter++).padStart(5, "0")}`;
      sales.push({
        id: `sale-${codeCounter}`,
        code,
        warehouseId: w.id,
        warehouseName: w.name,
        warehouseCode: w.code,
        userId: null,
        userName: "Empleado Demo",
        managerId: m.id,
        managerName: m.name,
        managerCode: m.code,
        customerName: `Cliente ${codeCounter}`,
        items,
        totalAmount: total,
        currency,
        paymentMode: "SINGLE",
        paidUSD: currency === "USD" ? total : 0,
        paidMN: currency === "MN" ? total * 320 : 0,
        paidEUR: currency === "EUR" ? total * 1.08 : 0,
        paidTransfer: currency === "TRANSFERENCIA" ? total : 0,
        paymentMethod: currency === "TRANSFERENCIA" ? "TRANSFERENCIA" : "EFECTIVO",
        cardId: card?.id || null,
        cardNumber: card?.number || null,
        cardName: card?.name || null,
        transferAmount: card ? total : null,
        note: null,
        status,
        createdAt: dayStart + Math.floor(Math.random() * 86400000),
        completedAt: status === "COMPLETADA" ? dayStart + Math.floor(Math.random() * 86400000) + 3600000 : null,
        cancelledAt: status === "CANCELADA" ? dayStart + Math.floor(Math.random() * 86400000) + 3600000 : null,
        cancelReason: status === "CANCELADA" ? "Cliente canceló" : null,
      });
    }
  }
  return sales;
})();

export const DEMO_RATE_CONFIG = {
  id: "default",
  apiUrl: "https://api.eltoque.com/v1/currency/rates",
  apiToken: null,
  markupMode: "PERCENT",
  markupUsd: 5,
  markupEur: 5,
  manualUsdRate: 320,
  manualEurRate: 345,
  lastSyncAt: Date.now() - 3600000,
  lastUsdRate: 305,
  lastEurRate: 332,
  cacheTtlMinutes: 60,
  autoSync: true,
};

export const DEMO_TODAY_RATES = {
  usd: 320,
  eur: 345,
  rawUsd: 305,
  rawEur: 332,
  source: "manual",
  lastSyncAt: Date.now() - 3600000,
  markupMode: "PERCENT",
  markupUsd: 5,
  markupEur: 5,
};
