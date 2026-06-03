import sys

def update_record(file_path, new_date, new_observations):
    with open(file_perm, 'r') as f:
        content = f.read()
    
    # Update last_strategic_review in frontmatter
    import re
    content = re.sub(r'last_strategic_review: .*', f'last_strategic_review: {new_date}', content)
    
    # Add new observations
    observations_block = f"\n\n## Strategic Observations\n\n- Date: {new_date}\n  - Evidence: {new_observations}\n"
    
    # We want to add it before the next section or at the end of the record part.
    # Since it's a new observation, let's append it to the end of the file or before the next '###' if it exists.
    # But the observations are usually at the top or bottom of the 'record' part.
    # Looking at the file, the observations are appended to the end of the record part.
    # Let's just append it to the end of the file for simplicity, but the user wants it in the 'Strategic Observations' section.
    # Actually, the file structure is: 
    # --- (frontmatter)
    # ## Summary
    # ## Active Projects
    # ## Next Actions
    # ...
    # ## Strategic Experiments
    # ...
    # ## Strategic Observations
    # (This is what we are adding)
    
    # Let's find the end of the record part. The record part seems to end where the '## Summary' starts.
    # Or maybe it's better to append to the end of the file.
    
    content += observations_block
    
    with open(file_path, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    # This is just a placeholder for the script I'll run via bash
    pass
