/**
 * Department registry — all known main departments and their sub-departments.
 * Used to populate the coverage group picker and validate schedule data.
 */
export const DEPARTMENT_REGISTRY = {
    'Frontline': [
        'Cashier',
        'Cashier Bldg 2',
        'Customer Service',
        'Customer Service Bldg 2',
        'Greeter',
        'Greeter Bldg 2',
        'Order Pick Up',
        'Order Pick Up Bldg 2'
    ],
    'Hardgoods': [
        'Action Sports',
        'Camping',
        'Climbing',
        'Cycling',
        'Hardgoods',
        'Nordic',
        'Optics',
        'Outfitter',
        'Packs',
        'Paddling',
        'Racks',
        'Rentals',
        'Ski',
        'Snow Clothing',
        'Snow Sports'
    ],
    'Softgoods': [
        'Childrenswear',
        'Clothing',
        'Fitting Room',
        'Footwear',
        'Mens Clothing',
        'Outfitter',
        'Softgoods',
        'Womens Clothing'
    ],
    'Office': [
        'Banker',
        'Office'
    ],
    'Order Fulfillment': [
        'Order Fulfillment',
        'Order Fulfillment Bldg 2'
    ],
    'Product Movement': [
        'Action Sports Stock',
        'Camping Stock',
        'Clothing Stock',
        'Cycling Stock',
        'Footwear Stock',
        'Hardgoods Stock',
        'Ops Stock',
        'Ops Stock Bldg 2',
        'Ship Recv',
        'Ship Recv Bldg 2',
        'Snow Sports Stock',
        'Softgoods Stock',
        'Stocking'
    ],
    'Shop': [
        'Assembler',
        'Service Advisor',
        'Ski Shop'
    ],
    'Mgmt Retail': [
        'Key Holder',
        'Key Holder Bldg 2',
        'Leader on Duty',
        'Management',
        'Management Bldg 2'
    ]
};

/** Default coverage optimization groups */
export const DEFAULT_GROUPS = [
    {
        id: 1,
        name: 'Building 2 Cross-trained',
        departments: [
            { main: 'Hardgoods', sub: 'Action Sports' },
            { main: 'Hardgoods', sub: 'Rentals' },
            { main: 'Frontline', sub: 'Cashier Bldg 2' },
            { main: 'Frontline', sub: 'Customer Service Bldg 2' }
        ]
    },
    {
        id: 2,
        name: 'Camping',
        departments: [
            { main: 'Hardgoods', sub: 'Camping' },
            { main: 'Hardgoods', sub: 'Hardgoods' }
        ]
    },
    {
        id: 3,
        name: 'Clothing',
        departments: [
            { main: 'Softgoods', sub: 'Clothing' },
            { main: 'Softgoods', sub: 'Softgoods' },
            { main: 'Softgoods', sub: 'Fitting Room' },
            { main: 'Softgoods', sub: 'Mens Clothing' },
            { main: 'Softgoods', sub: 'Womens Clothing' },
            { main: 'Softgoods', sub: 'Outfitter' },
            { main: 'Softgoods', sub: 'Childrenswear' }
        ]
    },
    { id: 4, name: 'Footwear', departments: [{ main: 'Softgoods', sub: 'Footwear' }] },
    { id: 5, name: 'Cashier', departments: [{ main: 'Frontline', sub: 'Cashier' }] },
    { id: 6, name: 'Customer Service', departments: [{ main: 'Frontline', sub: 'Customer Service' }] },
    {
        id: 7,
        name: 'Order Fulfillment',
        departments: [
            { main: 'Order Fulfillment', sub: 'Order Fulfillment' },
            { main: 'Order Fulfillment', sub: 'Order Fulfillment Bldg 2' }
        ]
    },
    {
        id: 8,
        name: 'Stocking',
        departments: [
            { main: 'Product Movement', sub: 'Softgoods Stock' },
            { main: 'Product Movement', sub: 'Stocking' },
            { main: 'Product Movement', sub: 'Snow Sports Stock' },
            { main: 'Product Movement', sub: 'Ops Stock Bldg 2' },
            { main: 'Product Movement', sub: 'Ops Stock' },
            { main: 'Product Movement', sub: 'Hardgoods Stock' },
            { main: 'Product Movement', sub: 'Footwear Stock' },
            { main: 'Product Movement', sub: 'Cycling Stock' },
            { main: 'Product Movement', sub: 'Clothing Stock' },
            { main: 'Product Movement', sub: 'Camping Stock' },
            { main: 'Product Movement', sub: 'Action Sports Stock' }
        ]
    },
    { id: 9, name: 'Service Advisor', departments: [{ main: 'Shop', sub: 'Service Advisor' }] },
    {
        id: 10,
        name: 'Management',
        departments: [
            { main: 'Mgmt Retail', sub: 'Management' },
            { main: 'Mgmt Retail', sub: 'Management Bldg 2' }
        ]
    }
];

/** Default advanced scheduling settings */
export const DEFAULT_ADVANCED_SETTINGS = {
    maxEarly: 15,
    maxDelay: 30,
    deptWeightMultiplier: 4,
    proximityWeight: 1
};

/** Default operating hours (10 AM – 9 PM) */
export const DEFAULT_OPERATING_HOURS = {
    startTime: 10 * 60,
    endTime: 21 * 60
};

/** Default per-day operating hours for the settings UI */
export const DEFAULT_HOURS_BY_DAY = {
    monday:    { start: '10:00', end: '21:00' },
    tuesday:   { start: '10:00', end: '21:00' },
    wednesday: { start: '10:00', end: '21:00' },
    thursday:  { start: '10:00', end: '21:00' },
    friday:    { start: '10:00', end: '21:00' },
    saturday:  { start: '10:00', end: '21:00' },
    sunday:    { start: '10:00', end: '21:00' }
};

/** Minimum gap in minutes between shift segments to be considered a split shift */
export const SPLIT_SHIFT_GAP_THRESHOLD = 30;

/** Column indices in the schedule data after column D is removed */
export const COL = {
    DEPT:  0,
    JOB:   1,
    NAME:  2,
    SHIFT: 3,
    REST1: 4,
    MEAL:  5,
    REST2: 6
};
