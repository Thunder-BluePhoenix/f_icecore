# Copyright (c) 2025, Thunder BluePhoenix and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from datetime import datetime


class FIceCoreCallRecording(Document):
	def before_save(self):
		"""Calculate duration if both start and end times are set."""
		if self.started_at and self.ended_at and not self.duration:
			start = self.started_at
			end = self.ended_at
			if isinstance(start, str):
				start = datetime.fromisoformat(start)
			if isinstance(end, str):
				end = datetime.fromisoformat(end)
			self.duration = int((end - start).total_seconds())
