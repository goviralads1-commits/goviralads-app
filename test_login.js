const http = require('http');

// Test admin login
const postData = JSON.stringify({
  identifier: 'admin@example.com',
  password: 'admin123'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log("Attempting to login with admin credentials...");

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response:', data);
    
    // If login successful, try client endpoints
    if (res.statusCode === 200) {
      try {
        const response = JSON.parse(data);
        const token = response.token;
        console.log('Token received:', token.substring(0, 20) + '...');
        
        // Test client endpoints with token
        testClientEndpoints(token);
      } catch (e) {
        console.log('Could not parse response as JSON');
      }
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.write(postData);
req.end();

function testClientEndpoints(token) {
  console.log("\n--- Testing CLIENT endpoints with token ---");
  
  // Test GET /client/plans
  const plansOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/client/plans',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };
  
  console.log("Testing GET /client/plans...");
  const plansReq = http.request(plansOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('GET /client/plans - Status:', res.statusCode);
      console.log('GET /client/plans - Response:', data);
      
      // Continue with next test
      testClientTasks(token);
    });
  });
  
  plansReq.on('error', (e) => console.error('Plans request error:', e));
  plansReq.end();
}

function testClientTasks(token) {
  // Test GET /client/tasks
  const tasksOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/client/tasks',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };
  
  console.log("\nTesting GET /client/tasks...");
  const tasksReq = http.request(tasksOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('GET /client/tasks - Status:', res.statusCode);
      console.log('GET /client/tasks - Response:', data);
      
      // Continue with admin tests
      testAdminEndpoints(token);
    });
  });
  
  tasksReq.on('error', (e) => console.error('Tasks request error:', e));
  tasksReq.end();
}

function testAdminEndpoints(token) {
  console.log("\n--- Testing ADMIN endpoints with token ---");
  
  // Test GET /admin/plans
  const adminPlansOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/admin/plans',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };
  
  console.log("Testing GET /admin/plans...");
  const adminPlansReq = http.request(adminPlansOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('GET /admin/plans - Status:', res.statusCode);
      console.log('GET /admin/plans - Response:', data);
      
      // Continue with admin tasks
      testAdminTasks(token);
    });
  });
  
  adminPlansReq.on('error', (e) => console.error('Admin plans request error:', e));
  adminPlansReq.end();
}

function testAdminTasks(token) {
  // Test GET /admin/tasks
  const adminTasksOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/admin/tasks',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };
  
  console.log("\nTesting GET /admin/tasks...");
  const adminTasksReq = http.request(adminTasksOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('GET /admin/tasks - Status:', res.statusCode);
      console.log('GET /admin/tasks - Response:', data);
      
      console.log("\n--- All tests completed ---");
    });
  });
  
  adminTasksReq.on('error', (e) => console.error('Admin tasks request error:', e));
  adminTasksReq.end();
}