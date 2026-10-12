"""Use Decky's bundled CA certificates while retaining normal TLS verification."""
import ssl


def verified_context():
    # Decky is a frozen Python application. Its OpenSSL default CA paths need
    # not match SteamOS's files; Decky's own downloader uses certifi too.
    try:
        import certifi
    except ImportError:
        return ssl.create_default_context()
    return ssl.create_default_context(cafile=certifi.where())
