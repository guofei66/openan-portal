// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0
//
//    Licensed under the Apache License, Version 2.0 (the "License"); you may
//    not use this file except in compliance with the License. You may obtain
//    a copy of the License at
//
//         http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
//    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
//    License for the specific language governing permissions and limitations
//    under the License.

// Remote plugin artifact server — serves plugin UMD bundles with CORS
// for REMOTE loading mode demos/tests. Each plugin is served under
// /plugins/<id>/ mapped to its dist-bundle directory.
import http from 'http';
import fs from 'fs';
import path from 'path';

const pluginRoot = 'D:/OpenAN-Github/orchestration-center-analysis/openan-website/plugins';

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = new URL(req.url, 'http://localhost:5500');

    // Expect /plugins/<id>/<file>
    const m = url.pathname.match(/^\/plugins\/([^/]+)\/(.+)$/);
    if (!m) {
        res.writeHead(404); res.end('not found'); return;
    }
    const [, id, file] = m;
    const filePath = path.join(pluginRoot, id, 'dist-bundle', file);

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404); res.end(`not found: ${url.pathname}`); return;
    }

    const ext = path.extname(filePath);
    const types = {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
});

server.listen(5500, '127.0.0.1', () => {
    console.log('Remote plugin server on http://127.0.0.1:5500/plugins/<id>/...');
});
