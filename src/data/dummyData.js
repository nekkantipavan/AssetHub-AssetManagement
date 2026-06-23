export const assets = [
  { id:'AST-001', name:'Dell Laptop XPS 15', serial:'DL-XPS-2024-001', value:145000, location:'Plant A – Chennai',    department:'IT',         employee:'Ravi Kumar',    created:'2024-01-15', modified:'2024-03-20', status:'Active'   },
  { id:'AST-002', name:'HP LaserJet Pro',    serial:'HP-LJ-2023-045', value:32000,  location:'Plant B – Hyderabad', department:'Finance',    employee:'Priya Sharma',  created:'2023-11-02', modified:'2024-02-10', status:'Active'   },
  { id:'AST-003', name:'Office Chair Ergo',  serial:'OC-ERG-2024-012',value:18500,  location:'Plant A – Chennai',    department:'HR',         employee:'Anjali Singh',  created:'2024-02-01', modified:'2024-02-01', status:'Active'   },
  { id:'AST-004', name:'Cisco IP Phone',     serial:'CP-IP-2023-099', value:12000,  location:'Plant C – Pune',      department:'Operations', employee:'Suresh Babu',   created:'2023-09-14', modified:'2024-01-05', status:'In Transfer'},
  { id:'AST-005', name:'UPS 650VA',          serial:'UPS-650-2024-07',value:8500,   location:'Plant B – Hyderabad', department:'IT',         employee:'Meena Pillai',  created:'2024-03-01', modified:'2024-03-01', status:'Active'   },
  { id:'AST-006', name:'Canon DSLR Camera',  serial:'CN-DS-2023-031', value:75000,  location:'Plant A – Chennai',    department:'Marketing',  employee:'Vikram Nair',   created:'2023-07-22', modified:'2024-02-28', status:'Active'   },
  { id:'AST-007', name:'Split AC 1.5T',      serial:'SAC-15-2022-055',value:45000,  location:'Plant C – Pune',      department:'Facilities', employee:'Deepa Rao',     created:'2022-05-10', modified:'2023-12-15', status:'Inactive' },
  { id:'AST-008', name:'Server Dell R740',   serial:'SV-R740-2024-01',value:520000, location:'Plant A – Chennai',    department:'IT',         employee:'Arun Prasad',   created:'2024-01-20', modified:'2024-03-15', status:'Active'   },
  { id:'AST-009', name:'Projector Epson',    serial:'EP-PRJ-2023-018',value:38000,  location:'Plant B – Hyderabad', department:'Training',   employee:'Kavitha Reddy', created:'2023-08-05', modified:'2024-01-22', status:'Active'   },
  { id:'AST-010', name:'Generator 25KVA',    serial:'GEN-25K-2021-03',value:380000, location:'Plant C – Pune',      department:'Facilities', employee:'Ramesh Gupta',  created:'2021-11-30', modified:'2023-06-10', status:'Active'   },
]

export const plants = [
  { id:'PLT-001', name:'Plant A – Chennai',   code:'CHN', location:'Chennai, Tamil Nadu',   assets:342, head:'Arjun Menon',    status:'Active' },
  { id:'PLT-002', name:'Plant B – Hyderabad', code:'HYD', location:'Hyderabad, Telangana',  assets:218, head:'Sita Lakshmi',   status:'Active' },
  { id:'PLT-003', name:'Plant C – Pune',      code:'PNE', location:'Pune, Maharashtra',     assets:175, head:'Rahul Deshpande',status:'Active' },
  { id:'PLT-004', name:'Plant D – Mumbai',    code:'MUM', location:'Mumbai, Maharashtra',   assets:89,  head:'Pooja Shah',     status:'Inactive'},
]

export const departments = [
  { id:'DEP-001', name:'Information Technology', code:'IT',   plant:'Plant A – Chennai',    assets:156, manager:'Arun Prasad',   status:'Active' },
  { id:'DEP-002', name:'Finance & Accounts',     code:'FIN',  plant:'Multi-Plant',          assets:92,  manager:'Priya Sharma',  status:'Active' },
  { id:'DEP-003', name:'Human Resources',        code:'HR',   plant:'Multi-Plant',          assets:48,  manager:'Anjali Singh',  status:'Active' },
  { id:'DEP-004', name:'Operations',             code:'OPS',  plant:'Plant C – Pune',       assets:204, manager:'Suresh Babu',   status:'Active' },
  { id:'DEP-005', name:'Marketing',              code:'MKT',  plant:'Plant B – Hyderabad',  assets:37,  manager:'Vikram Nair',   status:'Active' },
  { id:'DEP-006', name:'Facilities Management',  code:'FAC',  plant:'Multi-Plant',          assets:187, manager:'Deepa Rao',     status:'Active' },
]

export const users = [
  { id:'USR-001', name:'Arun Prasad',    email:'arun.prasad@company.com',  role:'Admin',    plant:'Plant A – Chennai',   department:'IT',      status:'Active',  lastLogin:'2024-03-21 09:15' },
  { id:'USR-002', name:'Priya Sharma',   email:'priya.sharma@company.com', role:'Manager',  plant:'Multi-Plant',         department:'Finance', status:'Active',  lastLogin:'2024-03-21 08:42' },
  { id:'USR-003', name:'Ravi Kumar',     email:'ravi.kumar@company.com',   role:'User',     plant:'Plant A – Chennai',   department:'IT',      status:'Active',  lastLogin:'2024-03-20 17:30' },
  { id:'USR-004', name:'Anjali Singh',   email:'anjali.singh@company.com', role:'Manager',  plant:'Multi-Plant',         department:'HR',      status:'Active',  lastLogin:'2024-03-21 10:05' },
  { id:'USR-005', name:'Suresh Babu',    email:'suresh.babu@company.com',  role:'User',     plant:'Plant C – Pune',      department:'Ops',     status:'Inactive',lastLogin:'2024-03-10 14:20' },
  { id:'USR-006', name:'Meena Pillai',   email:'meena.pillai@company.com', role:'User',     plant:'Plant B – Hyderabad', department:'IT',      status:'Active',  lastLogin:'2024-03-21 11:30' },
]

export const transfers = [
  { id:'TRF-001', asset:'Dell Laptop XPS 15', from:'Plant A – Chennai', to:'Plant B – Hyderabad', type:'Returnable',     date:'2024-03-15', status:'Completed', initiatedBy:'Arun Prasad'   },
  { id:'TRF-002', asset:'Canon DSLR Camera',  from:'Plant B – Hyderabad',to:'Plant A – Chennai',  type:'Non-Returnable', date:'2024-03-18', status:'In Progress',initiatedBy:'Vikram Nair'   },
  { id:'TRF-003', asset:'Cisco IP Phone',     from:'Plant A – Chennai', to:'Plant C – Pune',      type:'Returnable',     date:'2024-03-20', status:'Pending',    initiatedBy:'Ravi Kumar'    },
  { id:'TRF-004', asset:'UPS 650VA',          from:'Plant C – Pune',    to:'Plant B – Hyderabad', type:'Non-Returnable', date:'2024-03-22', status:'Completed',  initiatedBy:'Suresh Babu'   },
]

export const auditLogs = [
  { id:'LOG-001', action:'Asset Created',    module:'Assets',   user:'Arun Prasad',  details:'AST-008 Server Dell R740 created',          timestamp:'2024-03-21 09:15:32', ip:'192.168.1.10' },
  { id:'LOG-002', action:'Asset Modified',   module:'Assets',   user:'Priya Sharma', details:'AST-002 acquisition value updated',          timestamp:'2024-03-21 08:42:15', ip:'192.168.1.25' },
  { id:'LOG-003', action:'Transfer Initiated',module:'Transfer',user:'Vikram Nair',  details:'TRF-002 Canon DSLR initiated',               timestamp:'2024-03-20 14:30:00', ip:'192.168.1.42' },
  { id:'LOG-004', action:'Bulk Upload',       module:'Assets',   user:'Arun Prasad',  details:'45 records uploaded, 3 errors',             timestamp:'2024-03-20 11:05:22', ip:'192.168.1.10' },
  { id:'LOG-005', action:'User Role Changed', module:'Users',    user:'Arun Prasad',  details:'Meena Pillai role changed to Manager',      timestamp:'2024-03-19 16:20:45', ip:'192.168.1.10' },
  { id:'LOG-006', action:'Plant Added',       module:'Masters',  user:'Arun Prasad',  details:'PLT-004 Mumbai Plant added',                timestamp:'2024-03-18 10:00:00', ip:'192.168.1.10' },
  { id:'LOG-007', action:'Transfer Completed',module:'Transfer', user:'Suresh Babu',  details:'TRF-004 UPS 650VA transfer completed',      timestamp:'2024-03-17 15:45:10', ip:'192.168.1.33' },
  { id:'LOG-008', action:'Asset Deleted',     module:'Assets',   user:'Priya Sharma', details:'AST-011 old equipment decommissioned',       timestamp:'2024-03-16 09:30:00', ip:'192.168.1.25' },
]

export const chartData = {
  monthlyAssets: [
    { month:'Oct',added:18,disposed:3 },
    { month:'Nov',added:24,disposed:5 },
    { month:'Dec',added:12,disposed:2 },
    { month:'Jan',added:31,disposed:4 },
    { month:'Feb',added:28,disposed:6 },
    { month:'Mar',added:42,disposed:8 },
  ],
  byCategory: [
    { category:'IT Equipment',   value:342, fill:'#f59e0b' },
    { category:'Furniture',      value:218, fill:'#fb923c' },
    { category:'Machinery',      value:156, fill:'#fbbf24' },
    { category:'Vehicles',       value:89,  fill:'#fde68a' },
    { category:'Others',         value:19,  fill:'#fef3c7' },
  ],
  transferTrend: [
    { month:'Oct',returnable:8, nonReturnable:3  },
    { month:'Nov',returnable:12,nonReturnable:5  },
    { month:'Dec',returnable:6, nonReturnable:2  },
    { month:'Jan',returnable:15,nonReturnable:7  },
    { month:'Feb',returnable:11,nonReturnable:4  },
    { month:'Mar',returnable:18,nonReturnable:9  },
  ],
}

export const bulkUploadErrors = [
  { row:4,  field:'Serial Number',    value:'',          error:'Serial Number is required'              },
  { row:11, field:'Acquisition Value',value:'abc',       error:'Must be a numeric value'                },
  { row:19, field:'Department',       value:'Marketing2', error:'Department not found in master data'   },
]
