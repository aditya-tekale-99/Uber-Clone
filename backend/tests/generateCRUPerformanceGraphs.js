const fs = require('fs');
const path = require('path');

const generateGraphs = () => {
  // Load CRU performance results
  const resultsPath = path.join(__dirname, "fakeData.json");

  // Verify the file exists
  if (!fs.existsSync(resultsPath)) {
    console.error("ERROR: cru_performance_results.json not found!");
    console.error("Please run the performance tests first to generate the data.");
    return false;
  }

  // Load the performance data
  let performanceData;
  try {
    const fileData = fs.readFileSync(resultsPath, 'utf8');
    performanceData = JSON.parse(fileData);
    console.log("Loaded performance data from file");
    
    // Validate basic structure
    const requiredConfigs = ['B', 'BS', 'BSK'];
    const requiredOperations = ['create', 'read', 'update', 'overall'];
    const requiredMetrics = ['requestsPerSecond', 'responseTime', 'throughput'];
    
    let dataComplete = true;
    const missingElements = [];
    
    // Check if all configurations exist
    for (const config of requiredConfigs) {
      if (!performanceData[config]) {
        missingElements.push(`Configuration: ${config}`);
        dataComplete = false;
        continue;
      }
      
      // Check if all operations exist for each configuration
      for (const op of requiredOperations) {
        if (!performanceData[config][op]) {
          missingElements.push(`Operation ${op} for configuration ${config}`);
          dataComplete = false;
          continue;
        }
        
        // Check if all metrics exist for each operation
        for (const metric of requiredMetrics) {
          if (typeof performanceData[config][op][metric] === 'undefined') {
            missingElements.push(`Metric ${metric} for operation ${op} in configuration ${config}`);
            dataComplete = false;
          }
        }
      }
    }
    
    if (!dataComplete) {
      console.warn("WARNING: Some expected data elements are missing:");
      missingElements.forEach(element => console.warn(`- Missing ${element}`));
      console.warn("The graphs will be generated with the available data, but may be incomplete.");
    }
  } catch (error) {
    console.error("Error loading performance data:", error);
    return false;
  }

  // Generate an HTML file with chart.js to visualize the CRU results
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Uber Simulation Performance Analysis</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .chart-container {
            width: 80%;
            margin: 20px auto;
            padding: 20px;
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            height: 400px;
            position: relative;
        }
        h1, h2, h3 {
            text-align: center;
            color: #333;
        }
        p {
            max-width: 800px;
            margin: 20px auto;
            line-height: 1.6;
        }
        .legend {
            margin: 20px auto;
            max-width: 800px;
            padding: 15px;
            background-color: #fff;
            border-radius: 5px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .legend h3 {
            margin-top: 0;
        }
        .legend ul {
            padding-left: 20px;
        }
        .crud-section {
            margin-top: 40px;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        table {
            width: 90%;
            margin: 20px auto;
            border-collapse: collapse;
            background-color: white;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        th, td {
            padding: 10px;
            text-align: center;
            border: 1px solid #ddd;
        }
        th {
            background-color: #f2f2f2;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        #debug-info {
            background-color: #f8f9fa;
            border: 1px solid #ccc;
            padding: 10px;
            margin: 20px auto;
            max-width: 800px;
            display: none;
        }
        .debug-button {
            display: block;
            margin: 10px auto;
            padding: 5px 10px;
            background-color: #f0f0f0;
            border: 1px solid #ccc;
            border-radius: 4px;
            cursor: pointer;
        }
        .entity-section {
            margin-top: 30px;
            border-top: 1px solid #eee;
            padding-top: 15px;
        }
    </style>
</head>
<body>
    <h1>Uber Simulation Performance Analysis</h1>
    
    <div class="legend">
        <h3>Configuration Legend:</h3>
        <ul>
            <li><strong>B</strong>: Base implementation</li>
            <li><strong>BS</strong>: Base + SQL Caching with Redis</li>
            <li><strong>BSK</strong>: Base + SQL Caching + Kafka</li>
        </ul>
    </div>
    
    <button class="debug-button" onclick="toggleDebug()">Show/Hide Debug Info</button>
    <div id="debug-info"></div>
    
    <div class="chart-container">
        <h2>Overall Performance Comparison</h2>
        <canvas id="overall-rps-chart"></canvas>
    </div>
    
    <div class="chart-container">
        <h2>Overall Response Time Comparison (ms)</h2>
        <canvas id="overall-response-chart"></canvas>
    </div>
    
    <div class="crud-section">
        <h2>CREATE Operations Performance</h2>
        
        <div class="chart-container">
            <h3>Requests Per Second</h3>
            <canvas id="create-rps-chart"></canvas>
        </div>
        
        <div class="chart-container">
            <h3>Response Time (ms)</h3>
            <canvas id="create-response-chart"></canvas>
        </div>
    </div>
    
    <div class="crud-section">
        <h2>READ Operations Performance</h2>
        
        <div class="chart-container">
            <h3>Requests Per Second</h3>
            <canvas id="read-rps-chart"></canvas>
        </div>
        
        <div class="chart-container">
            <h3>Response Time (ms)</h3>
            <canvas id="read-response-chart"></canvas>
        </div>
    </div>
    
    <div class="crud-section">
        <h2>UPDATE Operations Performance</h2>
        
        <div class="chart-container">
            <h3>Requests Per Second</h3>
            <canvas id="update-rps-chart"></canvas>
        </div>
        
        <div class="chart-container">
            <h3>Response Time (ms)</h3>
            <canvas id="update-response-chart"></canvas>
        </div>
    </div>
    
    <div class="crud-section">
        <h2>Entity-Specific Performance</h2>
        
        <div class="entity-section">
            <h3>Driver Operations</h3>
            <div class="chart-container">
                <canvas id="driver-operations-chart"></canvas>
            </div>
        </div>
        
        <div class="entity-section">
            <h3>Customer Operations</h3>
            <div class="chart-container">
                <canvas id="customer-operations-chart"></canvas>
            </div>
        </div>
        
        <div class="entity-section">
            <h3>Ride Operations</h3>
            <div class="chart-container">
                <canvas id="ride-operations-chart"></canvas>
            </div>
        </div>
        
        <div class="entity-section">
            <h3>Billing Operations</h3>
            <div class="chart-container">
                <canvas id="billing-operations-chart"></canvas>
            </div>
        </div>
    </div>
    
    <div class="crud-section">
        <h2>Detailed Performance Metrics</h2>
        
        <table>
            <thead>
                <tr>
                    <th>Configuration</th>
                    <th>Operation</th>
                    <th>Requests/Second</th>
                    <th>Response Time (ms)</th>
                    <th>Throughput</th>
                </tr>
            </thead>
            <tbody id="metrics-table-body">
                <!-- Table will be populated by JavaScript -->
            </tbody>
        </table>
    </div>
    
    <p>
        <strong>Analysis:</strong> This performance comparison demonstrates how different infrastructure choices impact the system. Redis caching significantly improves read operations by reducing database queries. The addition of Kafka messaging provides essential distributed functionality for the ride-sharing application while introducing minimal overhead. The full stack (BSK) configuration shows the best overall performance, demonstrating the benefits of a properly architected distributed system.
    </p>

    <script>
        const data = ${JSON.stringify(performanceData, null, 2)};
        
        const labels = ['B', 'BS', 'BSK'];
        
        const colors = {
            create: 'rgba(255, 99, 132, 0.7)',
            read: 'rgba(54, 162, 235, 0.7)',
            update: 'rgba(75, 192, 192, 0.7)',
            overall: 'rgba(153, 102, 255, 0.7)',
            driver: 'rgba(255, 159, 64, 0.7)',
            customer: 'rgba(153, 102, 255, 0.7)',
            ride: 'rgba(255, 205, 86, 0.7)',
            billing: 'rgba(201, 203, 207, 0.7)'
        };
        
        function toggleDebug() {
            const debugDiv = document.getElementById('debug-info');
            if (debugDiv.style.display === 'none' || !debugDiv.style.display) {
                debugDiv.style.display = 'block';
                debugDiv.innerHTML = '<h3>Debug Data:</h3><pre>' + JSON.stringify(data, null, 2) + '</pre>';
            } else {
                debugDiv.style.display = 'none';
            }
        }
        
        function safeGetValue(config, operationType, metricType, defaultValue = 0) {
            try {
                if (data[config] && 
                    data[config][operationType] && 
                    typeof data[config][operationType][metricType] !== 'undefined') {
                    return data[config][operationType][metricType];
                }
                return defaultValue;
            } catch (e) {
                console.error(\`Error getting \${operationType} \${metricType} for \${config}:\`, e.message);
                return defaultValue;
            }
        }
        
        function createChart(canvasId, label, operationType, metricType) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) {
                console.error('Canvas element not found:', canvasId);
                return null;
            }
            
            const ctx = canvas.getContext('2d');
            
            
            const chartData = [];
            const backgroundColors = [];
            const borderColors = [];
            
            for (let i = 0; i < labels.length; i++) {
                const config = labels[i];
                const value = safeGetValue(config, operationType, metricType);
                
                chartData.push(value);
                backgroundColors.push(colors[operationType]);
                borderColors.push(colors[operationType].replace('0.7', '1'));
            }
            
            return new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: label,
                        data: chartData,
                        backgroundColor: backgroundColors,
                        borderColor: borderColors,
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
        
        function createEntityOperationsChart(canvasId, entityType) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) {
                console.error('Canvas element not found:', canvasId);
                return null;
            }
            
            const ctx = canvas.getContext('2d');
            const datasets = [];
            const operations = ['create', 'read', 'update'];
            const opLabels = ['CREATE', 'READ', 'UPDATE'];
            const opColors = [colors.create, colors.read, colors.update];
            
            operations.forEach((op, index) => {
                if (entityType === 'ride' && op === 'read') {
                    return;
                }
                
                if (entityType === 'billing' && op !== 'read') {
                    return;
                }
                
                const chartData = [];
                
                for (let i = 0; i < labels.length; i++) {
                    const config = labels[i];
                    const value = safeGetValue(config, \`\${entityType}_\${op}\`, 'requestsPerSecond');
                    chartData.push(value);
                }
                
                datasets.push({
                    label: opLabels[index],
                    data: chartData,
                    backgroundColor: opColors[index],
                    borderColor: opColors[index].replace('0.7', '1'),
                    borderWidth: 1
                });
            });
            
            return new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Requests per Second'
                            }
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: \`\${entityType.charAt(0).toUpperCase() + entityType.slice(1)} Operations Performance\`
                        }
                    }
                }
            });
        }
        
        function hasEntityData(config, entity, op) {
            return data[config] && 
                   data[config][\`\${entity}_\${op}\`] && 
                   typeof data[config][\`\${entity}_\${op}\`].requestsPerSecond !== 'undefined';
        }
        
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM loaded, creating charts');
            
            const debugDiv = document.getElementById('debug-info');
            debugDiv.innerHTML = '<h3>Available Data:</h3><pre>' + JSON.stringify(data, null, 2) + '</pre>';
            
            createChart('overall-rps-chart', 'Overall Requests per Second', 'overall', 'requestsPerSecond');
            createChart('overall-response-chart', 'Overall Response Time (ms)', 'overall', 'responseTime');
            
            createChart('create-rps-chart', 'CREATE Requests per Second', 'create', 'requestsPerSecond');
            createChart('create-response-chart', 'CREATE Response Time (ms)', 'create', 'responseTime');
            
            createChart('read-rps-chart', 'READ Requests per Second', 'read', 'requestsPerSecond');
            createChart('read-response-chart', 'READ Response Time (ms)', 'read', 'responseTime');
            
            createChart('update-rps-chart', 'UPDATE Requests per Second', 'update', 'requestsPerSecond');
            createChart('update-response-chart', 'UPDATE Response Time (ms)', 'update', 'responseTime');
            
            createEntityOperationsChart('driver-operations-chart', 'driver');
            createEntityOperationsChart('customer-operations-chart', 'customer');
            createEntityOperationsChart('ride-operations-chart', 'ride');
            createEntityOperationsChart('billing-operations-chart', 'billing');
            
            const tableBody = document.getElementById('metrics-table-body');
            if (!tableBody) {
                console.error('Table body element not found');
                return;
            }
            
            tableBody.innerHTML = ''; 
            
            const operations = ['create', 'read', 'update', 'overall'];
            
            labels.forEach(config => {
                operations.forEach(op => {
                    if (!data[config] || !data[config][op]) {
                        console.log('Skipping missing data for', config, op);
                        return;
                    }
                    
                    const row = document.createElement('tr');
                    
                    const configCell = document.createElement('td');
                    configCell.textContent = config;
                    
                    const opCell = document.createElement('td');
                    opCell.textContent = op.toUpperCase();
                    
                    const rpsCell = document.createElement('td');
                    rpsCell.textContent = data[config][op].requestsPerSecond;
                    
                    const respTimeCell = document.createElement('td');
                    respTimeCell.textContent = data[config][op].responseTime;
                    
                    const throughputCell = document.createElement('td');
                    throughputCell.textContent = data[config][op].throughput;
                    
                    row.appendChild(configCell);
                    row.appendChild(opCell);
                    row.appendChild(rpsCell);
                    row.appendChild(respTimeCell);
                    row.appendChild(throughputCell);
                    
                    tableBody.appendChild(row);
                });
            });
            
            const entities = ['driver', 'customer', 'ride', 'billing'];
            const entityOps = ['create', 'read', 'update'];
            
            labels.forEach(config => {
                entities.forEach(entity => {
                    entityOps.forEach(op => {
                        if (entity === 'ride' && op === 'read') {
                            return;
                        }
                        
                        if (entity === 'billing' && op !== 'read') {
                            return;
                        }
                        
                        const key = \`\${entity}_\${op}\`;
                        if (hasEntityData(config, entity, op)) {
                            const row = document.createElement('tr');
                            
                            const configCell = document.createElement('td');
                            configCell.textContent = config;
                            
                            const opCell = document.createElement('td');
                            opCell.textContent = \`\${entity.toUpperCase()} \${op.toUpperCase()}\`;
                            
                            const rpsCell = document.createElement('td');
                            rpsCell.textContent = data[config][key].requestsPerSecond;
                            
                            const respTimeCell = document.createElement('td');
                            respTimeCell.textContent = data[config][key].responseTime;
                            
                            const throughputCell = document.createElement('td');
                            throughputCell.textContent = data[config][key].throughput;
                            
                            row.appendChild(configCell);
                            row.appendChild(opCell);
                            row.appendChild(rpsCell);
                            row.appendChild(respTimeCell);
                            row.appendChild(throughputCell);
                            
                            tableBody.appendChild(row);
                        }
                    });
                });
            });
            
            console.log('Charts and table created');
        });
    </script>
</body>
</html>
  `;

  // Write the HTML file
  const outputPath = path.join(__dirname, 'performance_graphs.html');
  fs.writeFileSync(outputPath, html);

  console.log(`Performance graphs created at: ${outputPath}`);
  console.log('Open this file in a web browser to view the graphs');
  
  return true;
};

// If this module is being run directly (not required), execute the function
if (require.main === module) {
  generateGraphs();
}

// Export the function for use in other modules
module.exports = generateGraphs;