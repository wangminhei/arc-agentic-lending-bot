// App State
let activeAccountTab = 'positions';
let startTime = null;
let pollInterval = null;
let blockTxsHistory = []; // Track recent block transaction counts for the chart

// DOM Elements
const elements = {
  accountTabs: document.querySelectorAll('.account-tab'),
  accountTabContents: document.querySelectorAll('.account-tab-content'),
  btnTrigger: document.getElementById('btn-trigger'),
  btnClearLogs: document.getElementById('btn-clear-logs'),
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  workerIdBadge: document.getElementById('worker-id-badge'),
  statPolls: document.getElementById('stat-polls'),
  statUptime: document.getElementById('stat-uptime'),
  statLastUpdate: document.getElementById('stat-last-update'),
  
  ownerAddress: document.getElementById('owner-address'),
  ownerUsdc: document.getElementById('owner-usdc'),
  ownerUsdcBar: document.getElementById('owner-usdc-bar'),
  ownerEurc: document.getElementById('owner-eurc'),
  ownerEurcBar: document.getElementById('owner-eurc-bar'),
  ownerCirbtc: document.getElementById('owner-cirbtc'),
  ownerCirbtcBar: document.getElementById('owner-cirbtc-bar'),
  ownerExplorerUrl: document.getElementById('owner-explorer-url'),

  validatorAddress: document.getElementById('validator-address'),
  validatorUsdc: document.getElementById('validator-usdc'),
  validatorUsdcBar: document.getElementById('validator-usdc-bar'),
  validatorEurc: document.getElementById('validator-eurc'),
  validatorEurcBar: document.getElementById('validator-eurc-bar'),
  validatorCirbtc: document.getElementById('validator-cirbtc'),
  validatorCirbtcBar: document.getElementById('validator-cirbtc-bar'),
  validatorExplorerUrl: document.getElementById('validator-explorer-url'),
  
  ownerBtnText: document.getElementById('owner-btn-text'),
  validatorBtnText: document.getElementById('validator-btn-text'),
  validatorUsdcMid: document.getElementById('validator-usdc-mid'),
  
  previewLogs: document.getElementById('preview-logs'),
  tasksCountBadge: document.getElementById('tasks-count'),
  tasksTableBody: document.getElementById('tasks-table-body'),
  txsTableBody: document.getElementById('txs-table-body'),
  terminalPre: document.getElementById('terminal-pre'),
  toast: document.getElementById('toast'),
  chartCanvas: document.getElementById('activity-chart'),

  // Nanopayments Elements
  nanopayCount: document.getElementById('nanopay-count'),
  nanopayTotalSpent: document.getElementById('nanopay-total-spent'),
  nanopayGatewayBalance: document.getElementById('nanopay-gateway-balance'),
  nanopayLocalWallet: document.getElementById('nanopay-local-wallet'),
  nanopayActiveEndpoints: document.getElementById('nanopay-active-endpoints'),
  nanopayBreakdownList: document.getElementById('nanopay-breakdown-list'),
  nanopayTableBody: document.getElementById('nanopay-table-body'),

  // Lending Elements
  lendingCollateral: document.getElementById('lending-collateral'),
  lendingBorrowed: document.getElementById('lending-borrowed'),
  lendingBorrowPower: document.getElementById('lending-borrow-power'),
  lendingHealthFactor: document.getElementById('lending-health-factor'),
  lendingHealthBadge: document.getElementById('lending-health-badge'),
  lendingLtvVal: document.getElementById('lending-ltv-val'),
  lendingLtvFill: document.getElementById('lending-ltv-fill'),
  lendingPoolAddress: document.getElementById('lending-pool-address'),
  lendingAmount: document.getElementById('lending-amount'),
  btnLendingDeposit: document.getElementById('btn-lending-deposit'),
  btnLendingBorrow: document.getElementById('btn-lending-borrow'),
  btnLendingRepay: document.getElementById('btn-lending-repay'),
  btnLendingWithdraw: document.getElementById('btn-lending-withdraw'),
  
  // AI Elements
  aiLastAction: document.getElementById('ai-last-action'),
  aiRunMode: document.getElementById('ai-run-mode'),
  aiReasoningText: document.getElementById('ai-reasoning-text'),
  aiDecisionTime: document.getElementById('ai-decision-time'),
  a2aPurchasedData: document.getElementById('a2a-purchased-data'),
  a2aReportTime: document.getElementById('a2a-report-time'),
  btnManualA2a: document.getElementById('btn-manual-a2a')
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  setupAccountTabs();
  fetchData();
  initChart();
  setupLendingActions();
  setupA2AAction();
  setupPolicyActions();
  
  // Set up polling intervals
  pollInterval = setInterval(fetchData, 3000);
  setInterval(updateUptime, 1000);
  
  // Event listeners
  if (elements.btnTrigger) elements.btnTrigger.addEventListener('click', triggerPoll);
  if (elements.btnClearLogs) elements.btnClearLogs.addEventListener('click', clearTerminal);
  
  // Initialize Lucide Icons
  lucide.createIcons();
});

// Tab Setup for Trading Account Panel (Bottom Left)
function setupAccountTabs() {
  elements.accountTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-account-tab');
      activeAccountTab = tabName;
      
      // Update active links
      elements.accountTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update active sections
      elements.accountTabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `account-tab-${tabName}`) {
          content.classList.add('active');
        }
      });
      
      // Fetch fresh data when switching
      fetchData();
    });
  });
}

// Fetch Status, Results, and Logs
async function fetchData() {
  try {
    const statusRes = await fetch('/api/status');
    const statusData = await statusRes.json();
    
    const resultsRes = await fetch('/api/results');
    const resultsData = await resultsRes.json();

    const logsRes = await fetch('/api/logs');
    const logsData = await logsRes.text();
    
    updateOverview(statusData, resultsData);
    updateTasks(resultsData);
    updateTransactions(resultsData);
    updateLogs(logsData);
    updateChart(resultsData);
    updateNanopayments(resultsData);
    updateLending(statusData.lending);
    updateAIBrain(resultsData);
    updatePolicyStatus();
    
    if (elements.statLastUpdate) {
      elements.statLastUpdate.textContent = new Date().toLocaleTimeString('vi-VN');
    }
  } catch (err) {
    console.error('Lỗi khi tải dữ liệu API:', err);
    if (elements.statusText) elements.statusText.textContent = 'Mất kết nối API';
    if (elements.statusDot) elements.statusDot.className = 'status-dot error';
  }
}

// Helper to safely parse balances
function parseBalance(val) {
  if (val === undefined || val === null || val === "error" || isNaN(parseFloat(val))) {
    return 0;
  }
  return parseFloat(val);
}

// Format shortened address (0x1234...5678)
function formatAddressShort(addr) {
  if (!addr || addr === 'N/A' || addr.length < 10) return 'N/A';
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

// Update Overview Data
function updateOverview(status, results) {
  // Status Badge
  if (elements.statusText) {
    elements.statusText.textContent = status.status === 'running' ? 'LIVE' : status.status === 'stopped' ? 'TẠM DỪNG' : 'LỖI HỆ THỐNG';
  }
  if (elements.statusDot) {
    elements.statusDot.className = `status-dot ${status.status}`;
  }
  
  // Worker Meta
  if (elements.workerIdBadge) {
    elements.workerIdBadge.textContent = status.workerId || 'worker-01';
  }
  if (elements.statPolls) {
    elements.statPolls.textContent = status.pollCount || 0;
  }
  
  if (status.startTime) {
    startTime = new Date(status.startTime);
  }
  
  // Addresses
  const ownerAddr = status.ownerAddress || 'N/A';
  const valAddr = status.validatorAddress || 'N/A';
  
  if (elements.ownerAddress) elements.ownerAddress.textContent = ownerAddr;
  if (elements.validatorAddress) elements.validatorAddress.textContent = valAddr;
  
  if (elements.ownerBtnText) {
    elements.ownerBtnText.textContent = `Owner: ${formatAddressShort(ownerAddr)}`;
  }
  if (elements.validatorBtnText) {
    elements.validatorBtnText.textContent = `Val: ${formatAddressShort(valAddr)}`;
  }
  
  if (elements.ownerExplorerUrl) {
    elements.ownerExplorerUrl.href = `https://testnet.arcscan.app/address/${ownerAddr}`;
  }
  if (elements.validatorExplorerUrl) {
    elements.validatorExplorerUrl.href = `https://testnet.arcscan.app/address/${valAddr}`;
  }
  
  // Find relevant tasks
  const usdcTask = results.find(r => r.taskId === 'task-002' && r.status === 'success');
  const eurcTask = results.find(r => r.taskId === 'task-008' && r.status === 'success');
  const cirbtcTask = results.find(r => r.taskId === 'task-013' && r.status === 'success');
  const multicallTask = results.find(r => r.taskType === 'multicall_read' && r.status === 'success');
  
  // ── Owner Balances ────────────────────────────────────────────────────────
  let ownerUsdcVal = 0;
  if (usdcTask && usdcTask.result && usdcTask.result.owner) {
    ownerUsdcVal = parseBalance(usdcTask.result.owner.usdc);
  } else if (multicallTask && multicallTask.result && multicallTask.result.results) {
    ownerUsdcVal = parseBalance(multicallTask.result.results.usdc);
  }
  if (elements.ownerUsdc) elements.ownerUsdc.textContent = `${ownerUsdcVal.toFixed(2)} USDC`;
  if (elements.ownerUsdcBar) elements.ownerUsdcBar.style.width = `${Math.min(100, (ownerUsdcVal / (ownerUsdcVal + 30)) * 100)}%`;

  let ownerEurcVal = 0;
  if (eurcTask && eurcTask.result && eurcTask.result.owner) {
    ownerEurcVal = parseBalance(eurcTask.result.owner.eurc);
  } else if (multicallTask && multicallTask.result && multicallTask.result.results) {
    ownerEurcVal = parseBalance(multicallTask.result.results.eurc);
  }
  if (elements.ownerEurc) elements.ownerEurc.textContent = `${ownerEurcVal.toFixed(2)} EURC`;
  if (elements.ownerEurcBar) elements.ownerEurcBar.style.width = `${Math.min(100, (ownerEurcVal / (ownerEurcVal + 200)) * 100)}%`;

  let ownerCirbtcVal = 0;
  if (cirbtcTask && cirbtcTask.result && cirbtcTask.result.owner) {
    ownerCirbtcVal = parseBalance(cirbtcTask.result.owner.cirbtc);
  } else if (multicallTask && multicallTask.result && multicallTask.result.results) {
    ownerCirbtcVal = parseBalance(multicallTask.result.results.cirbtc);
  }
  if (elements.ownerCirbtc) elements.ownerCirbtc.textContent = `${ownerCirbtcVal.toFixed(6)} BTC`;
  if (elements.ownerCirbtcBar) elements.ownerCirbtcBar.style.width = `${Math.min(100, (ownerCirbtcVal / 0.005) * 100)}%`;
  
  // ── Validator Balances ────────────────────────────────────────────────────
  let validatorUsdcVal = 0;
  if (usdcTask && usdcTask.result && usdcTask.result.validator) {
    validatorUsdcVal = parseBalance(usdcTask.result.validator.usdc);
  }
  if (elements.validatorUsdc) elements.validatorUsdc.textContent = `${validatorUsdcVal.toFixed(2)} USDC`;
  if (elements.validatorUsdcBar) elements.validatorUsdcBar.style.width = `${Math.min(100, (validatorUsdcVal / (validatorUsdcVal + 30)) * 100)}%`;
  if (elements.validatorUsdcMid) elements.validatorUsdcMid.textContent = `$${validatorUsdcVal.toFixed(2)} USDC`;

  let validatorEurcVal = 0;
  if (eurcTask && eurcTask.result && eurcTask.result.validator) {
    validatorEurcVal = parseBalance(eurcTask.result.validator.eurc);
  }
  if (elements.validatorEurc) elements.validatorEurc.textContent = `${validatorEurcVal.toFixed(2)} EURC`;
  if (elements.validatorEurcBar) elements.validatorEurcBar.style.width = `${Math.min(100, (validatorEurcVal / (validatorEurcVal + 200)) * 100)}%`;

  let validatorCirbtcVal = 0;
  if (cirbtcTask && cirbtcTask.result && cirbtcTask.result.validator) {
    validatorCirbtcVal = parseBalance(cirbtcTask.result.validator.cirbtc);
  }
  if (elements.validatorCirbtc) elements.validatorCirbtc.textContent = `${validatorCirbtcVal.toFixed(6)} BTC`;
  if (elements.validatorCirbtcBar) elements.validatorCirbtcBar.style.width = `${Math.min(100, (validatorCirbtcVal / 0.005) * 100)}%`;
}

// Update Tasks Table
function updateTasks(results) {
  // List of task configs
  fetch('/tasks/tasks-worker-01.json')
    .then(r => r.json())
    .then(data => {
      const tasks = data.tasks;
      if (elements.tasksCountBadge) {
        elements.tasksCountBadge.textContent = `${tasks.length} Tasks`;
      }
      
      let html = '';
      tasks.forEach(t => {
        // Find latest execution result for this task
        const latestExec = results.find(r => r.taskId === t.id);
        let statusHtml = '<span class="status-badge status-skipped">Chưa chạy</span>';
        let lastRan = 'N/A';
        
        if (latestExec) {
          statusHtml = `<span class="status-badge status-${latestExec.status}">${latestExec.status === 'success' ? 'Thành công' : latestExec.status === 'failed' ? 'Thất bại' : 'Bỏ qua'}</span>`;
          lastRan = new Date(latestExec.executedAt).toLocaleTimeString('vi-VN');
        }
        
        html += `
          <tr>
            <td><strong>${t.id}</strong></td>
            <td><strong>${t.name}</strong></td>
            <td><code class="terminal-title" style="color:var(--primary-color); font-size:11px;">${t.type}</code></td>
            <td>${t.schedule}</td>
            <td class="${t.priority >= 5 ? 'priority-high' : t.priority >= 3 ? 'priority-med' : 'priority-low'}">${t.priority}</td>
            <td>${statusHtml}</td>
            <td>${lastRan}</td>
          </tr>
        `;
      });
      if (elements.tasksTableBody) elements.tasksTableBody.innerHTML = html;
    })
    .catch(() => {
      if (elements.tasksTableBody) {
        elements.tasksTableBody.innerHTML = '<tr><td colspan="7" class="loading-cell text-danger">Không tải được cấu hình task</td></tr>';
      }
    });
}

// Update Transactions list styled as Order Book rows
function updateTransactions(results) {
  // Filter task results that are NOT skipped and (contain transaction hashes or are payment/transfer/deployment actions)
  const txExecs = results.filter(r => r.status !== 'skipped' && (r.txHash || r.taskType === 'payment_processing' || r.taskType.endsWith('_transfer') || r.taskType === 'token_swap' || r.taskType === 'cctp_bridge' || r.taskType === 'deploy_token' || r.taskType === 'deploy_nft'));
  
  if (txExecs.length === 0) {
    if (elements.txsTableBody) {
      elements.txsTableBody.innerHTML = '<div class="log-placeholder">Chưa phát sinh giao dịch on-chain</div>';
    }
    return;
  }
  
  let html = '';
  // Sort latest first
  txExecs.sort((a, b) => new Date(b.executedAt) - new Date(a.executedAt));
  
  // Calculate relative depth for background bars
  const totalTxsCount = txExecs.length;
  
  txExecs.forEach((t, index) => {
    let actionType = t.taskType;
    let details = 'N/A';
    let txHash = t.txHash || '';
    
    // Custom transaction info extraction based on task type
    if (t.taskType === 'payment_processing' && t.result) {
      actionType = 'ERC-8183 Job';
      details = `Budget: ${t.result.budget_usdc || 5} USDC`;
      txHash = t.result.txHashes?.complete || t.result.txHashes?.create || '';
    } else if (t.taskType === 'random_transfer' && t.result) {
      actionType = 'Gửi ngẫu nhiên';
      details = `${t.result.amount} ${t.result.token}`;
    } else if (t.taskType.endsWith('_transfer') && t.result) {
      actionType = `Chuyển ${actionType.split('_')[0].toUpperCase()}`;
      details = `${t.result.amount} USDC ${t.result.direction === 'owner_to_validator' ? '→ Val' : '→ Owner'}`;
    } else if (t.taskType === 'token_swap' && t.result) {
      actionType = 'Hoán đổi Token';
      details = t.result.skipped ? 'Bỏ qua (No Key)' : `Swap ${t.result.amountIn} USDC -> ${t.result.tokenOut}`;
    } else if (t.taskType === 'cctp_bridge' && t.result) {
      actionType = 'CCTP Bridge';
      details = `Bridge ${t.result.amount} USDC`;
    } else if (t.taskType === 'onchain_identity') {
      actionType = 'ERC-8004 Identity';
      details = 'Đăng ký Agent';
    } else if (t.taskType === 'reputation_building' && t.result) {
      actionType = 'Reputation Feed';
      details = `Score: ${t.result.score || 95}`;
    } else if (t.taskType === 'deploy_token' && t.result && t.result.contractAddress) {
      actionType = 'Deploy Token';
      details = `${t.result.symbol}`;
    } else if (t.taskType === 'deploy_nft' && t.result && t.result.contractAddress) {
      actionType = 'Deploy NFT';
      details = `${t.result.symbol}`;
    }
    
    if (t.status === 'failed') {
      details = 'Lỗi thực thi';
    }

    // Colors according to status
    let typeClass = 'text-success';
    let bgClass = 'rgba(0, 230, 118, 0.08)';
    if (t.status === 'failed') {
      typeClass = 'text-danger';
      bgClass = 'rgba(255, 23, 68, 0.08)';
    } else if (t.status === 'skipped') {
      typeClass = 'text-warning';
      bgClass = 'rgba(255, 145, 0, 0.08)';
    }

    // Link parsing
    const txLink = txHash 
      ? `<a href="https://testnet.arcscan.app/tx/${txHash}" target="_blank" class="tx-hash-link">${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)} <i data-lucide="external-link" size="10" style="display:inline; vertical-align:middle;"></i></a>` 
      : '<span class="text-dim">N/A</span>';
      
    // Calculate a size bar width (percentage based on order/index)
    const barWidth = Math.max(10, Math.min(100, ((totalTxsCount - index) / totalTxsCount) * 100));

    html += `
      <div class="orderbook-entry">
        <div class="orderbook-entry-bg" style="width: ${barWidth}%; background-color: ${bgClass};"></div>
        <span class="${typeClass}" style="font-weight:700;">${actionType}</span>
        <span class="text-right text-muted">${details}</span>
        <span class="text-right">${txLink}</span>
      </div>
    `;
  });
  
  if (elements.txsTableBody) {
    elements.txsTableBody.innerHTML = html;
  }
  lucide.createIcons();
}

// Update Nanopayments tab dashboard
function updateNanopayments(results) {
  // Filter task results matching EIP-3009 nanopayments
  const nanopayTasks = results.filter(r => 
    r.status === 'success' && 
    (r.taskId === 'task-022' || r.taskId === 'task-023' || r.taskId === 'task-024' || r.taskId === 'task-025')
  );

  if (elements.nanopayCount) {
    elements.nanopayCount.textContent = `${nanopayTasks.length} Tx`;
  }

  if (nanopayTasks.length === 0) {
    if (elements.nanopayTableBody) {
      elements.nanopayTableBody.innerHTML = '<tr><td colspan="6" class="loading-cell">Chưa phát sinh giao dịch EIP-3009</td></tr>';
    }
    if (elements.nanopayBreakdownList) {
      elements.nanopayBreakdownList.innerHTML = '<div class="log-placeholder">Chưa có dữ liệu phân bổ chi phí.</div>';
    }
    return;
  }

  // Calculate metrics
  let totalSpent = 0;
  let latestGatewayBal = 0;
  
  // Endpoint statistics
  const allocations = {
    '/quote': { name: 'Inspirational Quote', cost: 0.001, spent: 0, count: 0, color: '#00d2ff' },
    '/dataset': { name: 'Analytics Dataset', cost: 0.01, spent: 0, count: 0, color: '#00e676' },
    '/compute': { name: 'Text Compute', cost: 0.0003, spent: 0, count: 0, color: '#a78bfa' },
    '/puzzle': { name: 'Premium Puzzle Solver', cost: 0.025, spent: 0, count: 0, color: '#fbbf24' }
  };

  let tableHtml = '';

  // Sort latest first
  nanopayTasks.sort((a, b) => new Date(b.executedAt) - new Date(a.executedAt));

  // Get gateway balance from the newest task
  const newestTask = nanopayTasks[0];
  if (newestTask && newestTask.result) {
    latestGatewayBal = parseBalance(newestTask.result.gatewayBalance || 0);
  }

  nanopayTasks.forEach(t => {
    let endpoint = '/quote';
    let spentVal = 0.001;
    let method = 'GET';
    let depositedVal = parseFloat(t.result.deposited || '0');

    if (t.taskId === 'task-023') {
      endpoint = '/dataset';
      spentVal = 0.01;
    } else if (t.taskId === 'task-024') {
      endpoint = '/compute';
      spentVal = 0.0003;
      method = 'POST';
    } else if (t.taskId === 'task-025') {
      endpoint = '/puzzle';
      spentVal = parseFloat(t.result.totalSpent || '0.025');
      method = 'GET/POST';
    }

    totalSpent += spentVal;
    
    // Accumulate allocations
    if (allocations[endpoint]) {
      allocations[endpoint].spent += spentVal;
      allocations[endpoint].count += 1;
    }

    const formattedDate = new Date(t.executedAt).toLocaleTimeString('vi-VN') + ' ' + new Date(t.executedAt).toLocaleDateString('vi-VN');
    const costText = `$${spentVal.toFixed(spentVal < 0.001 ? 4 : 3)} USDC`;
    const depText = depositedVal > 0 ? `<span class="text-success">+$${depositedVal.toFixed(2)}</span>` : '<span class="text-dim">-</span>';

    tableHtml += `
      <tr>
        <td><code class="terminal-title" style="color:var(--primary-color); font-size:11px;">${endpoint}</code></td>
        <td><strong>${method}</strong></td>
        <td class="breakdown-item-cost">${costText}</td>
        <td>${depText}</td>
        <td><span class="status-badge status-success">Thành công</span></td>
        <td>${formattedDate}</td>
      </tr>
    `;
  });

  // Display stats
  if (elements.nanopayTotalSpent) {
    elements.nanopayTotalSpent.textContent = `$${totalSpent.toFixed(4)} USDC`;
  }
  if (elements.nanopayGatewayBalance && newestTask.result.gatewayBalance) {
    elements.nanopayGatewayBalance.textContent = `${parseFloat(newestTask.result.gatewayBalance).toFixed(4)} USDC`;
  }
  
  let localWalletBalanceText = "N/A";
  if (newestTask.result.localWalletBalance) {
    localWalletBalanceText = `${parseFloat(newestTask.result.localWalletBalance).toFixed(2)} USDC`;
  } else {
    localWalletBalanceText = "5.00 USDC"; 
  }
  
  if (elements.nanopayLocalWallet) {
    elements.nanopayLocalWallet.textContent = localWalletBalanceText;
  }

  // Active Endpoints Count
  let activeCount = Object.keys(allocations).filter(k => allocations[k].count > 0).length;
  if (elements.nanopayActiveEndpoints) {
    elements.nanopayActiveEndpoints.textContent = `${activeCount} APIs Active`;
  }

  // Populate Table
  if (elements.nanopayTableBody) {
    elements.nanopayTableBody.innerHTML = tableHtml;
  }

  // Render Breakdown List
  let breakdownHtml = '';
  const maxAllocSpent = Math.max(...Object.keys(allocations).map(k => allocations[k].spent), 0.0001);

  Object.keys(allocations).forEach(k => {
    const alloc = allocations[k];
    const pct = (alloc.spent / maxAllocSpent) * 100;
    
    breakdownHtml += `
      <div class="breakdown-item">
        <div class="breakdown-item-header">
          <span>${alloc.name} (x${alloc.count})</span>
          <span class="breakdown-item-cost">$${alloc.spent.toFixed(4)} USDC</span>
        </div>
        <div class="breakdown-item-progress">
          <div class="breakdown-item-progress-fill" style="width: ${pct}%; background-color: ${alloc.color};"></div>
        </div>
      </div>
    `;
  });

  if (elements.nanopayBreakdownList) {
    elements.nanopayBreakdownList.innerHTML = breakdownHtml;
  }
}

// Update Logs Terminal
function updateLogs(logText) {
  if (!logText) {
    if (elements.terminalPre) elements.terminalPre.innerHTML = 'Chưa có dữ liệu logs ghi nhận...';
    if (elements.previewLogs) elements.previewLogs.innerHTML = '<div class="log-placeholder">Chưa ghi nhận logs...</div>';
    return;
  }
  
  // Format logs with CSS classes for styling
  const lines = logText.split('\n');
  let formattedHtml = '';
  let previewHtml = '';
  
  // Process lines for terminal
  lines.forEach(line => {
    if (!line.trim()) return;
    
    let lineClass = 'log-line';
    if (line.includes('[SUCCESS]') || line.includes('✓') || line.includes('✅')) {
      lineClass += ' log-succ';
    } else if (line.includes('[ERROR]') || line.includes('❌') || line.includes('✗') || line.includes('failed')) {
      lineClass += ' log-err';
    } else if (line.includes('[WARNING]') || line.includes('⚠️')) {
      lineClass += ' log-warn';
    } else if (line.includes('═') || line.includes('⚡') || line.includes('---')) {
      lineClass += ' log-sec';
    } else if (line.includes('[INFO]')) {
      lineClass += ' log-info';
    }
    
    formattedHtml += `<span class="${lineClass}">${escapeHtml(line)}</span>`;
  });
  
  // Render full terminal and auto-scroll to bottom
  if (elements.terminalPre) {
    elements.terminalPre.innerHTML = formattedHtml;
    elements.terminalPre.parentElement.scrollTop = elements.terminalPre.parentElement.scrollHeight;
  }
  
  // Render quick preview logs (last 5 lines) on overview sidebar box
  const lastLines = lines.filter(l => l.trim()).slice(-6);
  lastLines.forEach(line => {
    let lineClass = '';
    if (line.includes('[SUCCESS]') || line.includes('✓') || line.includes('✅')) lineClass = 'log-succ';
    else if (line.includes('[ERROR]') || line.includes('❌') || line.includes('✗') || line.includes('failed')) lineClass = 'log-err';
    else if (line.includes('[WARNING]') || line.includes('⚠️')) lineClass = 'log-warn';
    
    previewHtml += `<div class="${lineClass}">${escapeHtml(line)}</div>`;
  });
  if (elements.previewLogs) {
    elements.previewLogs.innerHTML = previewHtml;
    elements.previewLogs.scrollTop = elements.previewLogs.scrollHeight;
  }
}

// Update Uptime Calculation
function updateUptime() {
  if (!startTime) return;
  
  const diffMs = Date.now() - startTime;
  const secs = Math.floor(diffMs / 1000) % 60;
  const mins = Math.floor(diffMs / (1000 * 60)) % 60;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  
  const pad = (num) => String(num).padStart(2, '0');
  if (elements.statUptime) {
    elements.statUptime.textContent = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  }
}

// Trigger Manual Poll
async function triggerPoll() {
  if (!elements.btnTrigger) return;
  elements.btnTrigger.disabled = true;
  const icon = elements.btnTrigger.querySelector('i');
  if (icon) icon.style.animation = 'spin 1s linear infinite';
  
  try {
    const res = await fetch('/api/trigger', { method: 'POST' });
    const data = await res.json();
    
    showToast(data.message || 'Đã gửi lệnh kích hoạt polling!');
    // Delay slightly then fetch fresh data
    setTimeout(async () => {
      await fetchData();
      elements.btnTrigger.disabled = false;
      if (icon) icon.style.animation = '';
    }, 2000);
  } catch (err) {
    showToast('Không thể kích hoạt polling!', true);
    elements.btnTrigger.disabled = false;
    if (icon) icon.style.animation = '';
  }
}

// Clear logs screen locally
function clearTerminal() {
  if (elements.terminalPre) {
    elements.terminalPre.innerHTML = '<span class="log-line text-dim">Màn hình console đã được xóa.</span>';
  }
}

// Copy Address to Clipboard
function copyAddress(elementId) {
  const elem = document.getElementById(elementId);
  if (!elem) return;
  const text = elem.textContent;
  if (!text || text.includes('...')) return;
  
  navigator.clipboard.writeText(text).then(() => {
    showToast('Đã sao chép địa chỉ ví thành công!');
  }).catch(() => {
    showToast('Lỗi sao chép!', true);
  });
}

// Toast Alert Helper
function showToast(message, isError = false) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.style.background = isError ? 'var(--danger-color)' : 'var(--success-color)';
  elements.toast.style.color = isError ? '#fff' : '#000';
  elements.toast.style.boxShadow = isError ? '0 4px 15px rgba(255, 23, 68, 0.4)' : '0 4px 15px rgba(0, 230, 118, 0.4)';
  elements.toast.classList.add('show');
  
  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 2500);
}

// HTML Escape Helper
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── CANVAS CHART DRAWING LOGIC (Arc Bot Real-time Volatility look) ───────────

function initChart() {
  const canvas = elements.chartCanvas;
  if (!canvas) return;
  
  // Set logical dimensions matching the CSS element size
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  
  // Create dummy initial transaction history for rendering
  for (let i = 0; i < 25; i++) {
    blockTxsHistory.push(Math.floor(5 + Math.random() * 25));
  }
  
  drawChart();
  window.addEventListener('resize', resizeChart);
}

function resizeChart() {
  const canvas = elements.chartCanvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  drawChart();
}

function updateChart(results) {
  if (!elements.chartCanvas) return;
  // Extract latest block tx count from block fetch tasks to plot
  const blockFetchTxs = results
    .filter(r => r.taskId === 'task-001' && r.status === 'success' && r.result && r.result.transactionCount !== undefined)
    .sort((a, b) => new Date(a.executedAt) - new Date(b.executedAt));
    
  if (blockFetchTxs.length > 0) {
    blockTxsHistory = blockFetchTxs.map(t => parseInt(t.result.transactionCount)).slice(-25);
    // Fill out history with random data if less than 25 points
    while (blockTxsHistory.length < 25) {
      blockTxsHistory.unshift(Math.floor(10 + Math.random() * 15));
    }
  } else {
    // Add small random noise to create active waves on updates
    blockTxsHistory.push(Math.floor(Math.max(2, blockTxsHistory[blockTxsHistory.length - 1] + (Math.random() * 8 - 4))));
    if (blockTxsHistory.length > 25) blockTxsHistory.shift();
  }
  
  drawChart();
}

function drawChart() {
  const canvas = elements.chartCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const w = canvas.width;
  const h = canvas.height;
  
  ctx.clearRect(0, 0, w, h);
  
  // Draw Background grid
  ctx.strokeStyle = '#1d222d';
  ctx.lineWidth = 1;
  const gridRows = 5;
  const gridCols = 8;
  
  // Horizontal grid lines
  for (let i = 1; i < gridRows; i++) {
    const y = (h / gridRows) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // Vertical grid lines
  for (let i = 1; i < gridCols; i++) {
    const x = (w / gridCols) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Draw Area under the line (Gradient fill)
  if (blockTxsHistory.length < 2) return;
  
  const stepX = w / (blockTxsHistory.length - 1);
  const maxVal = Math.max(...blockTxsHistory, 30);
  const minVal = 0;
  const range = maxVal - minVal;
  
  const getX = (i) => i * stepX;
  const getY = (val) => h - 20 - ((val - minVal) / range) * (h - 40);

  // Path for fill
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(getX(0), getY(blockTxsHistory[0]));
  for (let i = 1; i < blockTxsHistory.length; i++) {
    // Curved Bezier line points
    const cpX1 = getX(i - 0.5);
    const cpY1 = getY(blockTxsHistory[i - 1]);
    const cpX2 = getX(i - 0.5);
    const cpY2 = getY(blockTxsHistory[i]);
    ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, getX(i), getY(blockTxsHistory[i]));
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  
  const fillGrad = ctx.createLinearGradient(0, 0, 0, h);
  fillGrad.addColorStop(0, 'rgba(0, 210, 255, 0.25)');
  fillGrad.addColorStop(1, 'rgba(0, 210, 255, 0.0)');
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Path for Stroke line (electric cyan line)
  ctx.beginPath();
  ctx.moveTo(getX(0), getY(blockTxsHistory[0]));
  for (let i = 1; i < blockTxsHistory.length; i++) {
    const cpX1 = getX(i - 0.5);
    const cpY1 = getY(blockTxsHistory[i - 1]);
    const cpX2 = getX(i - 0.5);
    const cpY2 = getY(blockTxsHistory[i]);
    ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, getX(i), getY(blockTxsHistory[i]));
  }
  
  ctx.strokeStyle = '#00d2ff';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(0, 210, 255, 0.6)';
  ctx.shadowBlur = 8;
  ctx.stroke();
  
  // Reset shadow for text and drawing circles
  ctx.shadowBlur = 0;
  
  // Draw pulsing dot at the last point
  const lastIdx = blockTxsHistory.length - 1;
  const lastX = getX(lastIdx);
  const lastY = getY(blockTxsHistory[lastIdx]);
  
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#00d2ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 8 + Math.sin(Date.now() / 150) * 2, 0, Math.PI * 2);
  ctx.stroke();
}

function updateLending(lending) {
  if (!lending) {
    if (elements.lendingPoolAddress) elements.lendingPoolAddress.textContent = 'Chưa deploy / config';
    return;
  }
  
  const usdcColl = parseFloat(lending.collateralUSDC || 0);
  const btcColl = parseFloat(lending.collateralCirBTC || 0);
  const borrowed = parseFloat(lending.borrowedEURC || 0);
  const btcPrice = parseFloat(lending.currentBtcPrice || 0);
  const totalCollUSD = parseFloat(lending.totalCollateralUSD || 0);
  const maxBorrow = parseFloat(lending.maxBorrowEURC || 0);
  const hfVal = lending.healthFactor || 'N/A';

  if (elements.lendingCollateral) elements.lendingCollateral.textContent = `${usdcColl.toFixed(2)} USDC`;
  
  const cirbtcCollEl = document.getElementById('lending-cirbtc-collateral');
  if (cirbtcCollEl) {
    cirbtcCollEl.textContent = `${btcColl.toFixed(8)} BTC`;
  }
  
  const totalCollEl = document.getElementById('lending-total-collateral');
  if (totalCollEl) {
    totalCollEl.textContent = `$${totalCollUSD.toFixed(2)} USD`;
  }
  
  const btcPriceEl = document.getElementById('lending-btc-price');
  if (btcPriceEl) {
    btcPriceEl.textContent = `$${btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  
  if (elements.lendingBorrowed) elements.lendingBorrowed.textContent = `${borrowed.toFixed(2)} EURC`;
  if (elements.lendingBorrowPower) elements.lendingBorrowPower.textContent = `${maxBorrow.toFixed(2)} EURC`;
  if (elements.lendingPoolAddress) elements.lendingPoolAddress.textContent = lending.poolAddress;

  // Update Health Factor UI & color
  if (elements.lendingHealthFactor) {
    if (hfVal === 'Safe' || hfVal === '99999' || hfVal === '999.99' || hfVal === '99999.00') {
      elements.lendingHealthFactor.textContent = 'Safe (Vô hạn)';
      elements.lendingHealthFactor.className = 'val text-success';
      if (elements.lendingHealthBadge) {
        elements.lendingHealthBadge.textContent = 'Safe HF';
        elements.lendingHealthBadge.className = 'tab-count-badge bg-success';
      }
    } else {
      elements.lendingHealthFactor.textContent = hfVal;
      const hfNum = parseFloat(hfVal);
      if (hfNum > 2.0) {
        elements.lendingHealthFactor.className = 'val text-success';
        if (elements.lendingHealthBadge) {
          elements.lendingHealthBadge.textContent = `${hfVal} HF`;
          elements.lendingHealthBadge.className = 'tab-count-badge bg-success';
        }
      } else if (hfNum > 1.25) {
        elements.lendingHealthFactor.className = 'val text-warning';
        if (elements.lendingHealthBadge) {
          elements.lendingHealthBadge.textContent = `${hfVal} HF`;
          elements.lendingHealthBadge.className = 'tab-count-badge bg-warning';
        }
      } else {
        elements.lendingHealthFactor.className = 'val text-danger';
        if (elements.lendingHealthBadge) {
          elements.lendingHealthBadge.textContent = 'RISK HF';
          elements.lendingHealthBadge.className = 'tab-count-badge bg-danger animate-pulse';
        }
      }
    }
  }

  // LTV Calculation
  let ltvPct = 0;
  if (totalCollUSD > 0) {
    const borrowedUSD = borrowed / 1.10;
    ltvPct = (borrowedUSD / totalCollUSD) * 100;
  }
  
  if (elements.lendingLtvVal) {
    elements.lendingLtvVal.textContent = `${ltvPct.toFixed(1)}%`;
  }
  if (elements.lendingLtvFill) {
    elements.lendingLtvFill.style.width = `${Math.min(100, ltvPct)}%`;
    if (ltvPct > 75) {
      elements.lendingLtvFill.style.backgroundColor = 'var(--danger-color)';
    } else if (ltvPct > 50) {
      elements.lendingLtvFill.style.backgroundColor = 'var(--warning-color)';
    } else {
      elements.lendingLtvFill.style.backgroundColor = 'var(--success-color)';
    }
  }

  // Calculate and update BTC Liquidation Price Risk Metric
  const liqPriceEl = document.getElementById('lending-liquidation-price');
  if (liqPriceEl) {
    if (borrowed === 0) {
      liqPriceEl.textContent = '$0.00';
      liqPriceEl.className = 'val text-success';
    } else if (btcColl === 0) {
      liqPriceEl.textContent = 'N/A';
      liqPriceEl.className = 'val text-gray-400';
    } else {
      const ltvRate = ((lending.ltv || 80) * 1.10) / 100;
      const liqPriceVal = ((borrowed / ltvRate) - usdcColl) / btcColl;
      if (liqPriceVal <= 0) {
        liqPriceEl.textContent = 'Never (USDC Backed)';
        liqPriceEl.className = 'val text-success';
      } else {
        liqPriceEl.textContent = `$${liqPriceVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        liqPriceEl.className = 'val text-danger';
      }
    }
  }

  // Update Agent Reputation & LTV Tier Display
  const repLtvEl = document.getElementById('lending-rep-ltv');
  if (repLtvEl) {
    const repScore = lending.reputation || 0;
    const ltvVal = lending.ltv || 80;
    repLtvEl.textContent = `${ltvVal}% (Rep: ${repScore})`;
  }
}

function setupLendingActions() {
  const actions = [
    { btn: elements.btnLendingDeposit, action: 'deposit' },
    { btn: elements.btnLendingBorrow, action: 'borrow' },
    { btn: elements.btnLendingRepay, action: 'repay' },
    { btn: elements.btnLendingWithdraw, action: 'withdraw' }
  ];
  
  actions.forEach(item => {
    if (item.btn) {
      item.btn.addEventListener('click', async () => {
        const amount = elements.lendingAmount.value;
        const selectTokenEl = document.getElementById('lending-token-select');
        const token = selectTokenEl ? selectTokenEl.value : 'USDC';

        if (!amount || parseFloat(amount) <= 0) {
          showToast('Vui lòng nhập số lượng hợp lệ!', true);
          return;
        }
        
        item.btn.disabled = true;
        const originalHtml = item.btn.innerHTML;
        item.btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin inline mr-1" size="14"></i> Chờ...';
        lucide.createIcons();
        
        try {
          const res = await fetch('/api/lending/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: item.action, amount, token })
          });
          const data = await res.json();
          
          if (data.status === 'success') {
            showToast(`Thành công: Giao dịch ${item.action} ${amount} ${token} hoàn tất!`);
          } else {
            showToast(`Thất bại: ${data.error || 'Giao dịch thất bại'}`, true);
          }
        } catch (err) {
          showToast('Lỗi kết nối API!', true);
        } finally {
          item.btn.disabled = false;
          item.btn.innerHTML = originalHtml;
          lucide.createIcons();
          fetchData();
        }
      });
    }
  });

  // Setup Oracle Simulators buttons
  const btnOracleCrash = document.getElementById('btn-oracle-crash');
  const btnOracleRestore = document.getElementById('btn-oracle-restore');
  const btnOracleSimDeleverage = document.getElementById('btn-oracle-sim-deleverage');
  const btnOracleSimCctp = document.getElementById('btn-oracle-sim-cctp');

  if (btnOracleCrash) {
    btnOracleCrash.addEventListener('click', async () => {
      btnOracleCrash.disabled = true;
      try {
        const res = await fetch('/api/lending/oracle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price: 60000 })
        });
        const data = await res.json();
        if (data.success) {
          showToast('BTC Price Crashed to $60,000! Watch the AI Agent defend the position.');
        } else {
          showToast(`Error: ${data.error}`, true);
        }
      } catch (err) {
        showToast('Lỗi kết nối Oracle API!', true);
      } finally {
        btnOracleCrash.disabled = false;
        fetchData();
      }
    });
  }

  if (btnOracleRestore) {
    btnOracleRestore.addEventListener('click', async () => {
      btnOracleRestore.disabled = true;
      try {
        const res = await fetch('/api/lending/oracle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price: 90000 })
        });
        const data = await res.json();
        if (data.success) {
          showToast('BTC Price Restored to $90,000!');
        } else {
          showToast(`Error: ${data.error}`, true);
        }
      } catch (err) {
        showToast('Lỗi kết nối Oracle API!', true);
      } finally {
        btnOracleRestore.disabled = false;
        fetchData();
      }
    });
  }

  if (btnOracleSimDeleverage) {
    btnOracleSimDeleverage.addEventListener('click', async () => {
      btnOracleSimDeleverage.disabled = true;
      try {
        // Step 1: Simulate Low USDC mode
        await fetch('/api/lending/simulate-low-usdc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'deleverage' })
        });
        
        // Step 2: Crash BTC Price
        const res = await fetch('/api/lending/oracle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price: 60000 })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Mô phỏng ví hết USDC & sập giá BTC! Agent sẽ tự động bán cirBTC giảm nợ.');
        } else {
          showToast(`Error: ${data.error}`, true);
        }
      } catch (err) {
        showToast('Lỗi kết nối Simulator API!', true);
      } finally {
        btnOracleSimDeleverage.disabled = false;
        fetchData();
      }
    });
  }

  if (btnOracleSimCctp) {
    btnOracleSimCctp.addEventListener('click', async () => {
      btnOracleSimCctp.disabled = true;
      try {
        // Step 1: Simulate Low USDC mode with cctp
        await fetch('/api/lending/simulate-low-usdc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'cctp' })
        });
        
        // Step 2: Crash BTC Price
        const res = await fetch('/api/lending/oracle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price: 60000 })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Mô phỏng ví hết USDC & sập giá BTC! Agent sẽ gọi Circle CCTP cứu ví.');
        } else {
          showToast(`Error: ${data.error}`, true);
        }
      } catch (err) {
        showToast('Lỗi kết nối Simulator API!', true);
      } finally {
        btnOracleSimCctp.disabled = false;
        fetchData();
      }
    });
  }
}

// ── AI Brain & A2A Commerce UI updater ─────────────────────────────────────
function updateAIBrain(results) {
  // Tìm task-032 mới nhất
  const aiTask = results.find(r => r.taskId === 'task-032');
  if (aiTask && aiTask.result && aiTask.result.decision) {
    const decision = aiTask.result.decision;
    
    if (elements.aiLastAction) {
      elements.aiLastAction.textContent = decision.action || 'N/A';
      elements.aiLastAction.className = 'val ' + (decision.action === 'NO_ACTION' ? 'text-dim' : 'text-success');
    }
    
    if (elements.aiRunMode) {
      elements.aiRunMode.textContent = decision.mode || 'FALLBACK';
      elements.aiRunMode.className = 'val ' + (decision.mode === 'REAL_AI' ? 'text-success' : 'text-primary');
    }
    
    const modeBadge = document.getElementById('ai-mode-badge');
    if (modeBadge) {
      modeBadge.textContent = decision.mode === 'REAL_AI' ? 'Real AI' : 'Simulated';
      modeBadge.style.background = decision.mode === 'REAL_AI' ? 'var(--success-color)' : 'var(--primary-color)';
    }

    if (elements.aiReasoningText) {
      elements.aiReasoningText.textContent = decision.reason || 'N/A';
    }

    if (elements.aiDecisionTime) {
      elements.aiDecisionTime.textContent = new Date(aiTask.executedAt).toLocaleTimeString('vi-VN') + ' ' + new Date(aiTask.executedAt).toLocaleDateString('vi-VN');
    }
  }

  // Tìm kết quả mua dữ liệu A2A (từ task-033 hoặc từ trường executionResult của task-032)
  let a2aResult = null;
  const a2aTask = results.find(r => r.taskId === 'task-033' && r.status === 'success');
  if (a2aTask && a2aTask.result && a2aTask.result.result) {
    a2aResult = a2aTask.result;
  } else {
    const aiA2a = results.find(r => r.taskId === 'task-032' && r.status === 'success' && r.result?.executionResult?.execution?.result?.data);
    if (aiA2a) {
      a2aResult = aiA2a.result.executionResult.execution;
    }
  }

  if (a2aResult && a2aResult.result) {
    const data = a2aResult.result.data || a2aResult.result.quote || JSON.stringify(a2aResult.result);
    const time = a2aResult.result.timestamp || a2aResult.executedAt || new Date().toISOString();
    
    if (elements.a2aPurchasedData) {
      elements.a2aPurchasedData.textContent = data;
    }
    if (elements.a2aReportTime) {
      elements.a2aReportTime.textContent = new Date(time).toLocaleTimeString('vi-VN');
    }
  }
}

function setupA2AAction() {
  if (elements.btnManualA2a) {
    elements.btnManualA2a.addEventListener('click', async () => {
      elements.btnManualA2a.disabled = true;
      const originalHtml = elements.btnManualA2a.innerHTML;
      elements.btnManualA2a.innerHTML = '<i data-lucide="loader-2" class="animate-spin inline mr-1" size="12"></i> Buying...';
      lucide.createIcons();
      
      try {
        const res = await fetch('/api/a2a/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        
        if (data.status === 'success') {
          showToast('A2A Commerce: Mua báo cáo dữ liệu thị trường thành công qua x402!');
        } else {
          showToast(`Thất bại: ${data.error || 'Giao dịch thất bại'}`, true);
        }
      } catch (err) {
        showToast('Lỗi kết nối API!', true);
      } finally {
        elements.btnManualA2a.disabled = false;
        elements.btnManualA2a.innerHTML = originalHtml;
        lucide.createIcons();
        fetchData();
      }
    });
  }
}

async function updatePolicyStatus() {
  try {
    const res = await fetch('/api/policy/status');
    const data = await res.json();
    if (data.success) {
      const { policy, tracker, simulateSellerFailure } = data;
      
      const policyDaily = document.getElementById('policy-daily');
      const policyPertx = document.getElementById('policy-pertx');
      const policySpent = document.getElementById('policy-spent');
      const inputDaily = document.getElementById('input-daily-limit');
      const inputPertx = document.getElementById('input-pertx-limit');
      const checkEnabled = document.getElementById('checkbox-policy-enabled');
      
      if (policyDaily) policyDaily.textContent = `${parseFloat(policy.maxDailyLimit).toFixed(2)} USDC`;
      if (policyPertx) policyPertx.textContent = `${parseFloat(policy.maxPerTxLimit).toFixed(2)} USDC`;
      if (policySpent) policySpent.textContent = `${parseFloat(tracker.spent).toFixed(2)} USDC`;
      
      if (checkEnabled) checkEnabled.checked = policy.enabled;
      if (inputDaily && document.activeElement !== inputDaily) inputDaily.value = policy.maxDailyLimit;
      if (inputPertx && document.activeElement !== inputPertx) inputPertx.value = policy.maxPerTxLimit;
      
      const toggleBtn = document.getElementById('btn-toggle-failure');
      const toggleIcon = document.getElementById('toggle-failure-icon');
      if (toggleBtn) {
        if (simulateSellerFailure) {
          toggleBtn.textContent = 'Sim Seller Failure: ON';
          toggleBtn.style.background = '#7a2a2a';
          toggleBtn.style.color = '#fff';
          toggleBtn.style.border = '1px solid #ff1744';
        } else {
          toggleBtn.textContent = 'Sim Seller Failure: OFF';
          toggleBtn.style.background = '#3a1a1a';
          toggleBtn.style.color = 'rgba(255,255,255,0.7)';
          toggleBtn.style.border = '1px solid #7a2a2a';
        }
        if (toggleIcon) {
          toggleBtn.prepend(toggleIcon);
          toggleIcon.className = simulateSellerFailure ? 'lucide-toggle-right text-danger' : 'lucide-toggle-left';
        }
      }
    }
  } catch (err) {}
}

function setupPolicyActions() {
  const btnUpdatePolicy = document.getElementById('btn-update-policy');
  if (btnUpdatePolicy) {
    btnUpdatePolicy.addEventListener('click', async () => {
      const enabled = document.getElementById('checkbox-policy-enabled').checked;
      const maxDailyLimit = document.getElementById('input-daily-limit').value;
      const maxPerTxLimit = document.getElementById('input-pertx-limit').value;
      
      btnUpdatePolicy.disabled = true;
      try {
        const res = await fetch('/api/policy/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled, maxDailyLimit, maxPerTxLimit })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Cập nhật chính sách chi tiêu thành công!');
          updatePolicyStatus();
        }
      } catch (err) {
        showToast('Không thể cập nhật chính sách!', true);
      } finally {
        btnUpdatePolicy.disabled = false;
      }
    });
  }

  const btnToggleFailure = document.getElementById('btn-toggle-failure');
  if (btnToggleFailure) {
    btnToggleFailure.addEventListener('click', async () => {
      btnToggleFailure.disabled = true;
      try {
        const statusRes = await fetch('/api/policy/status');
        const statusData = await statusRes.json();
        const currentFail = statusData.simulateSellerFailure;
        
        const res = await fetch('/api/policy/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ simulateSellerFailure: !currentFail })
        });
        const data = await res.json();
        if (data.success) {
          showToast(!currentFail ? 'Đã bật giả lập lỗi Seller. Giao dịch Escrow sẽ kích hoạt Auto-Refund sau 60 giây!' : 'Đã tắt giả lập lỗi Seller.');
          updatePolicyStatus();
        }
      } catch (err) {
        showToast('Lỗi cập nhật giả lập!', true);
      } finally {
        btnToggleFailure.disabled = false;
      }
    });
  }

  const btnRunEscrowA2a = document.getElementById('btn-run-escrow-a2a');
  if (btnRunEscrowA2a) {
    btnRunEscrowA2a.addEventListener('click', async () => {
      btnRunEscrowA2a.disabled = true;
      const originalHtml = btnRunEscrowA2a.innerHTML;
      btnRunEscrowA2a.innerHTML = '<i data-lucide="loader-2" class="animate-spin inline mr-1" size="12"></i> Running...';
      lucide.createIcons();
      
      const ledgerLogs = document.getElementById('escrow-ledger-logs');
      if (ledgerLogs) {
        ledgerLogs.innerHTML = `<div style="color: var(--primary-color);">[${new Date().toLocaleTimeString()}] Bắt đầu giao dịch Escrow A2A...</div>`;
      }

      try {
        const res = await fetch('/api/a2a/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        
        if (data.status === 'success') {
          const result = data.result;
          if (result && result.success) {
            showToast('Giao dịch Escrow A2A hoàn tất thành công!');
            if (ledgerLogs) {
              ledgerLogs.innerHTML = `
                <div style="color: var(--primary-color);">[${new Date().toLocaleTimeString()}] Bắt đầu: Đã lấy báo giá ${result.amount} USDC</div>
                <div style="color: var(--warning-color);">[${new Date().toLocaleTimeString()}] Ký quỹ: Gửi cọc thành công vào Escrow. Tx: <a href="https://testnet.arcscan.app/tx/${result.escrowTxHash}" target="_blank" style="color:var(--warning-color); text-decoration:underline;">${result.escrowTxHash.substring(0,8)}...</a></div>
                <div style="color: var(--success-color);">[${new Date().toLocaleTimeString()}] Delivery: Nhận dữ liệu thành công!</div>
                <div style="color: var(--success-color);">[${new Date().toLocaleTimeString()}] Giải ngân: Đã mở khóa ví cho Seller. Tx: <a href="https://testnet.arcscan.app/tx/${result.releaseTxHash}" target="_blank" style="color:var(--success-color); text-decoration:underline;">${result.releaseTxHash.substring(0,8)}...</a></div>
              `;
            }
          } else if (result && !result.success) {
            showToast('Seller không giao dữ liệu. Hoàn tiền đặt cọc!', true);
            if (ledgerLogs) {
              ledgerLogs.innerHTML = `
                <div style="color: var(--primary-color);">[${new Date().toLocaleTimeString()}] Bắt đầu: Đã lấy báo giá ${result.amount} USDC</div>
                <div style="color: var(--warning-color);">[${new Date().toLocaleTimeString()}] Ký quỹ: Gửi cọc thành công vào Escrow. Tx: <a href="https://testnet.arcscan.app/tx/${result.escrowTxHash}" target="_blank" style="color:var(--warning-color); text-decoration:underline;">${result.escrowTxHash.substring(0,8)}...</a></div>
                <div style="color: var(--danger-color);">[${new Date().toLocaleTimeString()}] Lỗi: Seller không giao hàng!</div>
                <div style="color: var(--danger-color);">[${new Date().toLocaleTimeString()}] Timeout: Chờ 60 giây hết hạn cọc...</div>
                <div style="color: var(--success-color);">[${new Date().toLocaleTimeString()}] Refund: Rút lại tiền đặt cọc thành công! Tx: <a href="https://testnet.arcscan.app/tx/${result.refundTxHash}" target="_blank" style="color:var(--success-color); text-decoration:underline;">${result.refundTxHash.substring(0,8)}...</a></div>
              `;
            }
          } else {
            showToast(`Thất bại: ${data.error || 'Giao dịch thất bại'}`, true);
          }
        } else {
          showToast(`Lỗi: ${data.error || 'Giao dịch thất bại'}`, true);
          if (ledgerLogs) {
            ledgerLogs.innerHTML = `<div style="color: var(--danger-color);">Lỗi giao dịch: ${data.error}</div>`;
          }
        }
      } catch (err) {
        showToast('Lỗi kết nối API!', true);
      } finally {
        btnRunEscrowA2a.disabled = false;
        btnRunEscrowA2a.innerHTML = originalHtml;
        lucide.createIcons();
        fetchData();
      }
    });
  }
}
