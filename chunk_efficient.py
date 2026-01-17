"""
B-READY Methodology Handbook Chunking Script (Memory Efficient)
===============================================================
Processes large PDFs in batches to avoid memory issues.
"""

from pypdf import PdfReader
import json
import re
from collections import defaultdict

def clean_text(text):
    """Clean up extracted text."""
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' {2,}', ' ', text)
    text = re.sub(r'^\d+\s*$', '', text, flags=re.MULTILINE)
    return text.strip()

def extract_keywords(text):
    """Extract keywords from text for indexing."""
    words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
    
    stop_words = {
        'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
        'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'were', 'they',
        'their', 'what', 'when', 'where', 'which', 'while', 'who', 'will', 'with',
        'would', 'there', 'this', 'that', 'these', 'those', 'then', 'than', 'them',
        'being', 'each', 'from', 'more', 'other', 'into', 'over', 'such', 'only',
        'also', 'about', 'after', 'before', 'between', 'through', 'during', 'under',
        'should', 'could', 'does', 'doing', 'because', 'some', 'same', 'very', 'just'
    }
    
    return set(word for word in words if word not in stop_words and len(word) > 2)

def process_pdf(pdf_path, output_dir):
    """Process PDF and create JSON files."""
    print(f"Processing: {pdf_path}")
    
    reader = PdfReader(pdf_path)
    total_pages = len(reader.pages)
    print(f"  Total pages: {total_pages}")
    
    chunks = []
    search_index = defaultdict(list)
    chunk_id = 0
    
    # Process page by page to save memory
    for page_num in range(total_pages):
        if page_num % 100 == 0:
            print(f"  Processing page {page_num + 1}/{total_pages}...")
        
        try:
            page = reader.pages[page_num]
            text = page.extract_text() or ""
            text = clean_text(text)
            
            if not text or len(text) < 50:
                continue
            
            # Split long pages into smaller chunks
            paragraphs = re.split(r'\n\n+', text)
            current_chunk = ""
            
            for para in paragraphs:
                para = para.strip()
                if not para:
                    continue
                
                if len(current_chunk) + len(para) > 1500 and current_chunk:
                    # Save chunk
                    chunk = {
                        "id": chunk_id,
                        "page": page_num + 1,
                        "content": current_chunk.strip()
                    }
                    chunks.append(chunk)
                    
                    # Update search index
                    for keyword in extract_keywords(current_chunk):
                        search_index[keyword].append(chunk_id)
                    
                    chunk_id += 1
                    current_chunk = para
                else:
                    current_chunk = current_chunk + "\n\n" + para if current_chunk else para
            
            # Save remaining text from page
            if current_chunk.strip():
                chunk = {
                    "id": chunk_id,
                    "page": page_num + 1,
                    "content": current_chunk.strip()
                }
                chunks.append(chunk)
                
                for keyword in extract_keywords(current_chunk):
                    search_index[keyword].append(chunk_id)
                
                chunk_id += 1
                
        except Exception as e:
            print(f"  Warning: Error on page {page_num + 1}: {e}")
            continue
    
    print(f"  Created {len(chunks)} chunks")
    print(f"  Indexed {len(search_index)} keywords")
    
    # Save files
    with open(f"{output_dir}/handbook-chunks.json", 'w') as f:
        json.dump(chunks, f, indent=2)
    
    with open(f"{output_dir}/search-index.json", 'w') as f:
        json.dump(dict(search_index), f, indent=2)
    
    print(f"\n✓ Files saved to {output_dir}/")
    print(f"  - handbook-chunks.json ({len(chunks)} chunks)")
    print(f"  - search-index.json ({len(search_index)} keywords)")

if __name__ == "__main__":
    import sys
    pdf_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "."
    process_pdf(pdf_path, output_dir)
