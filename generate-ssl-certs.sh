#!/usr/bin/env bash

# create ssl directory if it doesn't exist
mkdir -p ssl

# generate a private key
openssl genrsa -out ssl/key.pem 2048

# generate a certificate signing request
openssl req -new -key ssl/key.pem -out ssl/csr.pem -subj "/CN=localhost/O=PVZM/C=US"

# generate a self-signed certificate (valid for 365 days)
openssl x509 -req -days 365 -in ssl/csr.pem -signkey ssl/key.pem -out ssl/cert.pem

# clean up the certificate signing request
rm ssl/csr.pem

echo "SSL certificates generated in the ssl directory."
echo "Private key: ssl/key.pem"
echo "Certificate: ssl/cert.pem"
echo "These are self-signed certificates for development or Cloudflare hosting only."
