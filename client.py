#!/usr/bin/env python

from jsonrpc_requests import Server


def manual():

    import requests
    import json

    url = "http://localhost:3000/RPC/foo"
    headers = {'content-type': 'application/json'}

    # Example echo method
    payload = {
        "method": "foo",
        "params": ["f"],
        "jsonrpc": "2.0",
        "id": 0,
    }
    response = requests.post(
        url, data=json.dumps(payload), headers=headers).json()

    print response
    
def main():

    bionet = Server('http://localhost:3000/rpc')

    res = bionet.foo('lol')
    print res

    res = bionet.bar('sfa')
    print res

if __name__ == "__main__":
    main()
