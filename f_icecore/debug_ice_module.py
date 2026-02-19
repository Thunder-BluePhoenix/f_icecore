
import frappe
from f_icecore.f_icecore.api.turn_credentials import get_ice_servers, get_turn_config

def execute():
    try:
        print("--- TURN Config ---")
        print(get_turn_config())
        print("\n--- ICE Servers ---")
        print(get_ice_servers())
    except Exception as e:
        print(f"Error: {e}")

execute()
