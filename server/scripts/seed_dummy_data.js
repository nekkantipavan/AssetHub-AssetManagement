const pool = require('../db')
const bcrypt = require('bcrypt')

async function seed() {
  console.log('Starting dummy data generation...')
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    console.log('Cleaning up old test data...')
    // Truncate tables with CASCADE to reset clean
    await client.query(`
      TRUNCATE TABLE 
        return_items, 
        transfer_returns, 
        transfer_items, 
        transfers, 
        asset_request_items, 
        asset_requests, 
        assets,
        departments,
        plants
      RESTART IDENTITY CASCADE
    `)

    // Clean fuzzed/dirty entries from asset_masters
    await client.query(`
      DELETE FROM asset_masters 
      WHERE type NOT IN ('category', 'asset_class', 'asset_status', 'status', 'company_code', 'cost_center')
         OR value LIKE '%<%' OR value LIKE '%{%' OR value LIKE '%(%' OR value LIKE '%sleep%'
    `)

    // 1. Seed Plants
    console.log('Seeding Plants...')
    const plantsData = [
      { code: '1001', name: 'United Telelinks Neolyncs PVT LTD. (APEX)', location: 'Bangalore, Karnataka', head: 'Rajesh Sharma', challan_prefix: 'UTN-APX' },
      { code: '1002', name: 'United Telelinks Neolyncs PVT LTD. (GEM)', location: 'Bangalore, Karnataka', head: 'Venkatesh Rao', challan_prefix: 'UTN-GEM' },
      { code: '1003', name: 'Neolync Tele Communications Private Limited, (GEM)', location: 'Sriperumbudur, Tamil Nadu', head: 'Karthik Raman', challan_prefix: 'NTC-GEM' },
      { code: '1004', name: 'Neolync Tele Communications Private Limited, (SRI CITY)', location: 'Sri City, Andhra Pradesh', head: 'Srinivasa Reddy', challan_prefix: 'NTC-SRC' },
      { code: '1005', name: 'United Telelinks Neolyncs PVT LTD. (NOIDA)', location: 'Noida Sector 63, UP', head: 'Amitabh Verma', challan_prefix: 'UTN-NOI' },
      { code: '1006', name: 'Neolync Technologies (HYDERABAD)', location: 'Gachibowli, Hyderabad', head: 'Praveen Kumar', challan_prefix: 'NTC-HYD' },
    ]

    const plantIds = []
    for (const p of plantsData) {
      const res = await client.query(`
        INSERT INTO plants (code, name, location, head, status, challan_prefix, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'Active', $5, NOW(), NOW())
        RETURNING id
      `, [p.code, p.name, p.location, p.head, p.challan_prefix])
      plantIds.push(res.rows[0].id)
    }

    // 2. Seed Departments for each plant
    console.log('Seeding Departments...')
    const deptTemplates = [
      { code: 'IT', name: 'Information Technology', manager: 'Anand Kulkarni' },
      { code: 'SMT', name: 'SMT Production', manager: 'Suresh Patel' },
      { code: 'QC', name: 'Quality Control & Testing', manager: 'Deepa Nair' },
      { code: 'MAINT', name: 'Plant Maintenance', manager: 'Ramesh Babu' },
      { code: 'ADMIN', name: 'Administration & Facilities', manager: 'Meera Deshmukh' },
      { code: 'HR', name: 'Human Resources', manager: 'Pooja Hegde' },
      { code: 'LOG', name: 'Logistics & Warehouse', manager: 'Ganesh Shinde' },
      { code: 'RND', name: 'Research & Development', manager: 'Dr. Vikram Sen' },
      { code: 'FIN', name: 'Finance & Accounts', manager: 'Raghavan Iyer' },
    ]

    const validDepts = []
    for (const pid of plantIds) {
      for (const d of deptTemplates) {
        const res = await client.query(`
          INSERT INTO departments (code, name, plant_id, manager, status, created_at)
          VALUES ($1, $2, $3, $4, 'Active', NOW())
          RETURNING id, plant_id, name, code
        `, [d.code, d.name, pid, d.manager])
        validDepts.push(res.rows[0])
      }
    }

    // 3. Seed Asset Masters
    console.log('Seeding Asset Masters...')
    const masters = [
      // category
      { type: 'category', value: 'Plant & Machinery', sort_order: 1 },
      { type: 'category', value: 'Computer & comp. Devices', sort_order: 2 },
      { type: 'category', value: 'Office Equipment', sort_order: 3 },
      { type: 'category', value: 'Furniture & Fixtures', sort_order: 4 },
      { type: 'category', value: 'Electrical Equipment', sort_order: 5 },
      { type: 'category', value: 'Assets under const.', sort_order: 6 },
      { type: 'category', value: 'Vehicles', sort_order: 7 },
      { type: 'category', value: 'Tools & Gauges', sort_order: 8 },

      // asset_class
      { type: 'asset_class', value: 'Machinery', sort_order: 1 },
      { type: 'asset_class', value: 'Computers', sort_order: 2 },
      { type: 'asset_class', value: 'Office Equip', sort_order: 3 },
      { type: 'asset_class', value: 'Furniture', sort_order: 4 },
      { type: 'asset_class', value: 'Electrical', sort_order: 5 },
      { type: 'asset_class', value: 'CWIP', sort_order: 6 },
      { type: 'asset_class', value: 'Automobiles', sort_order: 7 },
      { type: 'asset_class', value: 'Instrumentation', sort_order: 8 },

      // asset_status
      { type: 'asset_status', value: 'In Use', sort_order: 1 },
      { type: 'asset_status', value: 'Idle', sort_order: 2 },
      { type: 'asset_status', value: 'Under Maintenance', sort_order: 3 },
      { type: 'asset_status', value: 'Transferred', sort_order: 4 },
      { type: 'asset_status', value: 'Scrapped', sort_order: 5 },

      // status
      { type: 'status', value: 'Active', sort_order: 1 },
      { type: 'status', value: 'Inactive', sort_order: 2 },

      // company_code
      { type: 'company_code', value: 'UTN01', sort_order: 1 },
      { type: 'company_code', value: 'UTN02', sort_order: 2 },
      { type: 'company_code', value: 'NTC01', sort_order: 3 },
      { type: 'company_code', value: 'NTC02', sort_order: 4 },

      // cost_center
      { type: 'cost_center', value: 'CC101', description: 'SMT Line Operations', sort_order: 1 },
      { type: 'cost_center', value: 'CC102', description: 'IT Infrastructure', sort_order: 2 },
      { type: 'cost_center', value: 'CC103', description: 'Quality Assurance', sort_order: 3 },
      { type: 'cost_center', value: 'CC104', description: 'Plant Maintenance', sort_order: 4 },
      { type: 'cost_center', value: 'CC105', description: 'Administration & Facility', sort_order: 5 },
      { type: 'cost_center', value: 'CC106', description: 'Assembly Line 1', sort_order: 6 },
      { type: 'cost_center', value: 'CC107', description: 'Warehouse & Logistics', sort_order: 7 },
      { type: 'cost_center', value: 'CC108', description: 'R&D Laboratory', sort_order: 8 },
    ]

    for (const m of masters) {
      await client.query(`
        INSERT INTO asset_masters (type, value, description, sort_order, is_active, created_at)
        VALUES ($1, $2, $3, $4, true, NOW())
        ON CONFLICT (type, lower(value)) DO UPDATE
        SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order, is_active = true
      `, [m.type, m.value, m.description || null, m.sort_order])
    }

    // 4. Seed Users
    console.log('Seeding Users...')
    const defaultPasswordHash = await bcrypt.hash('Admin@123', 10)
    
    const usersData = [
      { empId: 'EMP001', name: 'Admin User', email: 'admin@assethub.com', role: 'Admin', plant_id: plantIds[0] },
      { empId: 'EMP002', name: 'Pavan Nekkanti', email: 'pavan.n@neolync.com', role: 'Manager', plant_id: plantIds[0] },
      { empId: 'EMP003', name: 'Anand Kulkarni', email: 'anand.k@neolync.com', role: 'User', plant_id: plantIds[0] },
      { empId: 'EMP004', name: 'Suresh Patel', email: 'suresh.p@neolync.com', role: 'User', plant_id: plantIds[1] },
      { empId: 'EMP005', name: 'Deepa Nair', email: 'deepa.n@neolync.com', role: 'User', plant_id: plantIds[2] },
      { empId: 'EMP006', name: 'Ramesh Babu', email: 'ramesh.b@neolync.com', role: 'User', plant_id: plantIds[3] },
      { empId: 'EMP007', name: 'Meera Deshmukh', email: 'meera.d@neolync.com', role: 'User', plant_id: plantIds[4] },
      { empId: 'EMP008', name: 'Pooja Hegde', email: 'pooja.h@neolync.com', role: 'User', plant_id: plantIds[5] },
      { empId: 'EMP009', name: 'Ganesh Shinde', email: 'ganesh.s@neolync.com', role: 'User', plant_id: plantIds[1] },
      { empId: 'EMP010', name: 'Vikram Sen', email: 'vikram.s@neolync.com', role: 'User', plant_id: plantIds[2] },
      { empId: 'EMP011', name: 'Sunil Gavaskar', email: 'sunil.g@neolync.com', role: 'User', plant_id: plantIds[0] },
      { empId: 'EMP012', name: 'Priyanka Chopra', email: 'priyanka.c@neolync.com', role: 'User', plant_id: plantIds[3] },
      { empId: 'EMP013', name: 'Rahul Dravid', email: 'rahul.d@neolync.com', role: 'User', plant_id: plantIds[4] },
      { empId: 'EMP014', name: 'Sneha Reddy', email: 'sneha.r@neolync.com', role: 'User', plant_id: plantIds[5] },
      { empId: 'EMP015', name: 'Manoj Bajpayee', email: 'manoj.b@neolync.com', role: 'User', plant_id: plantIds[0] },
    ]

    const userIds = []
    for (const u of usersData) {
      const res = await client.query(`
        INSERT INTO users (employee_id, username, name, email, password_hash, role, status, plant_id, created_at)
        VALUES ($1, $1, $2, $3, $4, $5, 'Active', $6, NOW())
        ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name, employee_id = EXCLUDED.employee_id, role = EXCLUDED.role, plant_id = EXCLUDED.plant_id
        RETURNING id, name, employee_id
      `, [u.empId, u.name, u.email, defaultPasswordHash, u.role, u.plant_id])
      userIds.push(res.rows[0])
    }

    // 5. Generate 1,200 Assets
    console.log('Generating 1,200 realistic assets...')

    const assetTemplates = [
      // Computers
      { name: 'Dell Latitude 5420 Laptop 14" i7 16GB 512GB SSD', category: 'Computer & comp. Devices', asset_class: 'Computers', make: 'Dell Technologies', supplier: 'Dell India Pvt Ltd', valueRange: [65000, 95000] },
      { name: 'HP EliteBook 840 G8 Notebook PC Core i5', category: 'Computer & comp. Devices', asset_class: 'Computers', make: 'HP Inc.', supplier: 'Redington India Ltd', valueRange: [58000, 82000] },
      { name: 'Apple MacBook Pro 16" M2 Pro 32GB 1TB', category: 'Computer & comp. Devices', asset_class: 'Computers', make: 'Apple Inc.', supplier: 'Imagine Tresor Systems', valueRange: [195000, 260000] },
      { name: 'Lenovo ThinkPad X1 Carbon Gen 10 Ultrabook', category: 'Computer & comp. Devices', asset_class: 'Computers', make: 'Lenovo', supplier: 'Compuage Infocom Ltd', valueRange: [110000, 155000] },
      { name: 'Dell PowerEdge R750 Rack Server 2U Dual Xeon', category: 'Computer & comp. Devices', asset_class: 'Computers', make: 'Dell Technologies', supplier: 'Dell India Pvt Ltd', valueRange: [380000, 750000] },
      { name: 'Cisco Catalyst 9300 48-Port PoE+ Gigabit Switch', category: 'Computer & comp. Devices', asset_class: 'Computers', make: 'Cisco Systems', supplier: 'Ingram Micro India', valueRange: [240000, 420000] },
      { name: 'Fortinet FortiGate 100F Enterprise Firewall', category: 'Computer & comp. Devices', asset_class: 'Computers', make: 'Fortinet Inc.', supplier: 'Ingram Micro India', valueRange: [185000, 310000] },
      { name: 'Dell 27" 4K UHD USB-C Hub Monitor (P2723QE)', category: 'Computer & comp. Devices', asset_class: 'Computers', make: 'Dell Technologies', supplier: 'Redington India Ltd', valueRange: [32000, 48000] },

      // Machinery & SMT
      { name: 'Fuji NXT III High-Speed SMT Placement Modular Mounter', category: 'Plant & Machinery', asset_class: 'Machinery', make: 'Fuji Corporation Japan', supplier: 'Trans-Techno Solutions Ltd', valueRange: [8500000, 14000000] },
      { name: 'Yamaha YSM20R High-Efficiency Dual-Beam Mounter', category: 'Plant & Machinery', asset_class: 'Machinery', make: 'Yamaha Motor Co.', supplier: 'Yamaha Robotics India', valueRange: [7200000, 11500000] },
      { name: 'Heller 1809 MK5 9-Zone Convection Reflow Oven', category: 'Plant & Machinery', asset_class: 'Machinery', make: 'Heller Industries USA', supplier: 'SMT International Ltd', valueRange: [4200000, 6800000] },
      { name: 'Koh Young Zenith 3D Automated Optical Inspection (AOI)', category: 'Plant & Machinery', asset_class: 'Machinery', make: 'Koh Young Technology', supplier: 'Kyzen Asia Pacific', valueRange: [5100000, 7800000] },
      { name: 'Speedline MPM Momentum Elite Automatic Stencil Printer', category: 'Plant & Machinery', asset_class: 'Machinery', make: 'ITW EAE Speedline', supplier: 'SMT Systems India', valueRange: [3600000, 5400000] },
      { name: 'Puff Panel Partition Work SMT Line 2 Cleanroom', category: 'Plant & Machinery', asset_class: 'CWIP', make: 'Nicomac Cleanrooms', supplier: 'Nicomac India Pvt Ltd', valueRange: [850000, 1650000] },
      { name: 'Pillar Air Conditioning & Cleanroom Ducting System', category: 'Plant & Machinery', asset_class: 'Machinery', make: 'Voltas IES Division', supplier: 'Voltas Limited', valueRange: [1200000, 2400000] },

      // Electrical & Instrumentation
      { name: 'APC Smart-UPS RT 10kVA 230V Online On-Line UPS', category: 'Electrical Equipment', asset_class: 'Electrical', make: 'Schneider Electric', supplier: 'Schneider Electric India', valueRange: [220000, 360000] },
      { name: 'Cummins 250kVA Silent Diesel Generator Set', category: 'Electrical Equipment', asset_class: 'Electrical', make: 'Cummins India', supplier: 'Jakson Power Solutions', valueRange: [1250000, 1950000] },
      { name: 'Schneider Electric 3-Phase 415V Main LT Panel', category: 'Electrical Equipment', asset_class: 'Electrical', make: 'Schneider Electric', supplier: 'L&T Switchgear Distribution', valueRange: [450000, 850000] },
      { name: 'Keysight InfiniiVision DSOX3024T 200MHz Oscilloscope', category: 'Tools & Gauges', asset_class: 'Instrumentation', make: 'Keysight Technologies', supplier: 'Keysight India Pvt Ltd', valueRange: [310000, 490000] },
      { name: 'Fluke 289 True-RMS Industrial Logging Multimeter', category: 'Tools & Gauges', asset_class: 'Instrumentation', make: 'Fluke Corporation', supplier: 'Fluke India Sales', valueRange: [55000, 85000] },
      { name: 'Ersa HR 550 High-End Hybrid BGA Rework Station', category: 'Plant & Machinery', asset_class: 'Machinery', make: 'Kurtz Ersa Germany', supplier: 'Bertech Industrial India', valueRange: [1850000, 2700000] },
      { name: 'Hakko FM-203 Dual Port ESD-Safe Soldering Station', category: 'Tools & Gauges', asset_class: 'Instrumentation', make: 'Hakko Corporation Japan', supplier: 'Adinath Electronics', valueRange: [38000, 62000] },

      // Office & Furniture
      { name: 'Featherlite Helix High-Back Ergonomic Mesh Chair', category: 'Furniture & Fixtures', asset_class: 'Furniture', make: 'Featherlite Furniture', supplier: 'Featherlite Living Products', valueRange: [12500, 22000] },
      { name: 'Godrej Interio 8-Seater Boardroom Conference Table', category: 'Furniture & Fixtures', asset_class: 'Furniture', make: 'Godrej & Boyce Mfg', supplier: 'Godrej Interio Bangalore', valueRange: [45000, 95000] },
      { name: 'Heavy Duty Modular ESD Safe Assembly Workstation 1.8m', category: 'Furniture & Fixtures', asset_class: 'Furniture', make: 'Messung Workplace System', supplier: 'Messung Systems Pvt Ltd', valueRange: [35000, 65000] },
      { name: 'Daikin 2.0 Ton 5-Star Heavy Duty Inverter Split AC', category: 'Office Equipment', asset_class: 'Office Equip', make: 'Daikin Airconditioning', supplier: 'Daikin India Authorized', valueRange: [48000, 68000] },
      { name: 'Canon imageRUNNER ADVANCE DX C3835i Multi-Function Printer', category: 'Office Equipment', asset_class: 'Office Equip', make: 'Canon Inc.', supplier: 'Canon India Pvt Ltd', valueRange: [165000, 290000] },
      { name: 'Zebra ZT411 Industrial RFID/Barcode Label Thermal Printer', category: 'Office Equipment', asset_class: 'Office Equip', make: 'Zebra Technologies', supplier: 'Bar Code India Ltd', valueRange: [85000, 140000] },

      // Vehicles & Material Handling
      { name: 'Toyota 8FBN25 Electric Counterbalance Forklift 2.5 Ton', category: 'Vehicles', asset_class: 'Automobiles', make: 'Toyota Material Handling', supplier: 'Toyota Material Handling India', valueRange: [1450000, 2200000] },
      { name: 'Godrej Hydraulic Hand Pallet Truck 2.5 Ton Capacity', category: 'Plant & Machinery', asset_class: 'Machinery', make: 'Godrej Material Handling', supplier: 'Godrej & Boyce Mfg', valueRange: [22000, 38000] },
      { name: 'Cleanroom Dynamic Pass Box with HEPA Filtration', category: 'Assets under const.', asset_class: 'CWIP', make: 'Aero Clean Technology', supplier: 'Airtech Equipment India', valueRange: [180000, 320000] },
    ]

    const companyCodes = ['UTN01', 'UTN02', 'NTC01', 'NTC02']
    const costCenters = ['CC101', 'CC102', 'CC103', 'CC104', 'CC105', 'CC106', 'CC107', 'CC108']
    const statuses = ['Active', 'Active', 'Active', 'Active', 'Inactive', 'In Transfer']
    const assetStatuses = ['In Use', 'In Use', 'In Use', 'In Use', 'Idle', 'Under Maintenance']
    const fiscalYears = ['2021', '2022', '2023', '2024', '2025', '2026']

    const employeeNames = [
      'Anand Kulkarni', 'Suresh Patel', 'Deepa Nair', 'Ramesh Babu', 'Meera Deshmukh',
      'Pooja Hegde', 'Ganesh Shinde', 'Vikram Sen', 'Raghavan Iyer', 'Sunil Gavaskar',
      'Priyanka Chopra', 'Rahul Dravid', 'Sneha Reddy', 'Manoj Bajpayee', 'Rohit Sharma',
      'Virat Kohli', 'Jasprit Bumrah', 'Smriti Mandhana', 'Harmanpreet Kaur', 'Ravindra Jadeja',
      'Ashwin Ravichandran', 'Shreyas Iyer', 'KL Rahul', 'Mohammed Shami', 'Rishabh Pant',
      'Hardik Pandya', 'Suryakumar Yadav', 'Axar Patel', 'Kuldeep Yadav', 'Yuzvendra Chahal'
    ]

    const totalToGenerate = 1200
    const batchSize = 100
    let assetCount = 0

    for (let b = 0; b < totalToGenerate; b += batchSize) {
      const currentBatchCount = Math.min(batchSize, totalToGenerate - b)
      const values = []
      const placeholders = []
      let pIdx = 1

      for (let i = 0; i < currentBatchCount; i++) {
        const seqNum = b + i + 1
        const assetCode = `AST-${String(seqNum).padStart(6, '0')}`
        const subSequence = (seqNum % 15 === 0) ? (seqNum % 3 + 1) : 0 // Some sub-assets
        const tpl = assetTemplates[(seqNum + i * 3) % assetTemplates.length]
        const plantId = plantIds[(seqNum * 7) % plantIds.length]
        
        // Find depts for this plant
        const plantDepts = validDepts.filter(d => d.plant_id === plantId)
        const dept = plantDepts.length > 0 ? plantDepts[(seqNum * 5) % plantDepts.length] : validDepts[0]

        const assignedEmp = employeeNames[(seqNum + i) % employeeNames.length]
        const userObj = userIds[(seqNum) % userIds.length]

        const randomVal = Math.floor(tpl.valueRange[0] + Math.random() * (tpl.valueRange[1] - tpl.valueRange[0]))
        const fy = fiscalYears[(seqNum) % fiscalYears.length]
        const purchaseYear = parseInt(fy) - (seqNum % 2)
        const purchaseMonth = String((seqNum % 12) + 1).padStart(2, '0')
        const purchaseDay = String((seqNum % 28) + 1).padStart(2, '0')
        const purchaseDate = `${purchaseYear}-${purchaseMonth}-${purchaseDay}`

        const warrantyYear = purchaseYear + 3
        const warrantyDate = `${warrantyYear}-${purchaseMonth}-${purchaseDay}`

        const sn = `SN${purchaseYear}${tpl.make.substring(0, 3).toUpperCase()}${String(seqNum * 41 + 1000).padStart(7, '0')}`
        const invNo = `INV/${fy}/${String(seqNum * 13 + 500).padStart(5, '0')}`

        const status = statuses[seqNum % statuses.length]
        const assetStatus = assetStatuses[seqNum % assetStatuses.length]
        const compCode = companyCodes[seqNum % companyCodes.length]
        const cc = costCenters[seqNum % costCenters.length]

        values.push(
          assetCode,
          subSequence,
          tpl.name,
          sn,
          randomVal,
          plantId,
          dept ? dept.id : null,
          userObj ? userObj.id : null,
          status,
          tpl.category,
          tpl.asset_class,
          assignedEmp,
          purchaseDate,
          warrantyDate,
          tpl.make,
          assetStatus,
          tpl.supplier,
          `Asset acquired under FY ${fy} capital expenditure budget for ${dept ? dept.name : 'facility'}.`,
          compCode,
          cc,
          invNo,
          fy
        )

        const rowPlaceholders = []
        for (let col = 0; col < 22; col++) {
          rowPlaceholders.push(`$${pIdx++}`)
        }
        placeholders.push(`(${rowPlaceholders.join(', ')})`)
        assetCount++
      }

      const insertSql = `
        INSERT INTO assets (
          asset_code, sub_sequence, name, serial_number, acquisition_value,
          plant_id, dept_id, assigned_user_id, status, category,
          asset_class, assigned_employee, date_of_purchase, warranty_date, make,
          asset_status, supplier_name, notes, company_code, cost_center,
          reference_invoice_no, fiscal_year
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (asset_code, sub_sequence) DO NOTHING
      `
      await client.query(insertSql, values)
    }

    // 6. Seed sample Transfers & Requests for realistic dashboard counters
    console.log('Seeding sample Transfers and Asset Requests...')
    
    // Sample transfers
    const sampleAssets = await client.query('SELECT id, plant_id FROM assets LIMIT 20')
    for (let t = 0; t < 5; t++) {
      const fromP = plantIds[t % plantIds.length]
      const toP = plantIds[(t + 1) % plantIds.length]
      const trfRes = await client.query(`
        INSERT INTO transfers (transfer_code, from_plant_id, to_plant_id, transfer_type, status, initiated_by, created_at)
        VALUES ($1, $2, $3, 'Returnable', 'Pending Approval', $4, NOW())
        RETURNING id
      `, [`TRF-2026-${String(t + 1).padStart(4, '0')}`, fromP, toP, userIds[0].id])
      
      const trfId = trfRes.rows[0].id
      // Add items
      const a1 = sampleAssets.rows[t * 2]
      const a2 = sampleAssets.rows[t * 2 + 1]
      if (a1) await client.query(`INSERT INTO transfer_items (transfer_id, asset_id, notes) VALUES ($1, $2, $3)`, [trfId, a1.id, 'Transfer for production batch'])
      if (a2) await client.query(`INSERT INTO transfer_items (transfer_id, asset_id, notes) VALUES ($1, $2, $3)`, [trfId, a2.id, 'Transfer for QA testing'])
    }

    // Sample asset requests
    for (let r = 0; r < 4; r++) {
      const dept = validDepts[r % validDepts.length]
      const reqRes = await client.query(`
        INSERT INTO asset_requests (request_code, requested_by, asset_owner, dept_id, total_amount, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id
      `, [
        `REQ-2026-${String(r + 1).padStart(4, '0')}`,
        userIds[r % userIds.length].id,
        userIds[r % userIds.length].name,
        dept.id,
        150000 * (r + 1),
        r % 2 === 0 ? 'Pending Dept Head' : 'Waiting for Asset Code'
      ])

      const reqId = reqRes.rows[0].id
      await client.query(`
        INSERT INTO asset_request_items (request_id, seq, material_description, quantity, unit_price, total_amount, company_code, cost_center, plant_id, asset_life, remarks)
        VALUES ($1, 1, $2, 2, 75000, 150000, 'UTN01', 'CC101', $3, 5, 'Required for upcoming line expansion.')
      `, [reqId, 'Dell Latitude 5420 Laptop', plantIds[0]])
    }

    await client.query('COMMIT')
    console.log(`✅ SUCCESS: Successfully seeded ${assetCount} assets, ${plantIds.length} plants, ${validDepts.length} departments, ${masters.length} master entries, and ${userIds.length} users!`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('❌ SEED FAILED:', err)
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
