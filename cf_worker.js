const hostlist = { 'api.dandanplay.net': null };
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
};

function handleOptions(request) {
    let headers = request.headers;
    if (
        'OPTIONS' == request.method &&
        headers.get('Origin') &&
        headers.get('Access-Control-Request-Method') &&
        headers.get('Access-Control-Request-Headers')
    ) {
        let respHeaders = {
            ...corsHeaders,
            'Access-Control-Allow-Headers': headers.get('Access-Control-Request-Headers'),
        }
        return new Response(null, {
            headers: respHeaders,
        });
    } else {
        return new Response(null, {
            headers: {
                'Allow': 'GET, HEAD, POST, OPTIONS',
            },
        });
    }
}

async function handleRequest(request) {
    let response;
    if (request.method === 'OPTIONS') {
        response = handleOptions(request);
    } else {
        const urlObj = new URL(request.url);
        let url = urlObj.href.replace(urlObj.origin + '/cors/', '').trim();
        if (0 !== url.indexOf('https://') && 0 === url.indexOf('https:')) {
            url = url.replace('https:/', 'https://');
        } else if (0 !== url.indexOf('http://') && 0 === url.indexOf('http:')) {
            url = url.replace('http:/', 'http://');
        }
        let tUrlObj = new URL(url);
        if (!(tUrlObj.hostname in hostlist)) {
            return Forbidden(tUrlObj);
        }
        response = await fetch(url, {
            headers: request.headers,
            body: request.body,
            method: request.method,
        });
        response = new Response(await response.body, response);
        response.headers.set('Access-Control-Allow-Origin', '*');
        response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    }
    return response;
}

function Forbidden(url) {
    return new Response(`Hostname ${url.hostname} not allowed.`, {
        status: 403,
    });
}

addEventListener('fetch', (event) => {
    return event.respondWith(handleRequest(event.request));
});
